//! ZKPassport bridge protocol — wire-compatible with `@obsidion/bridge` v0.12
//! (the channel between the prover device and the verifier SDK).
//!
//! Pure protocol layer: no sockets, no IO. The platform owns the WebSocket and
//! feeds frames in/out. Standalone by design so it can move to the bridge repo.
//!
//! Protocol facts (from the TS source; keep exactly):
//! - secp256k1 ECDH; pubkeys 33-byte compressed, hex on the wire.
//! - AES-256-GCM key = FIRST 32 BYTES of the raw compressed shared point
//!   (parity byte + 31 bytes of X) — no KDF.
//! - Nonce = sha256(bridge_id_hex_string)[0..12], constant per session.
//! - Inner messages: deflate(JSON) → base64, always chunk-tagged; outer frame
//!   is plaintext JSON-RPC `encryptedMessage` with base64 ciphertext payload.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use k256::ecdh::diffie_hellman;
use k256::elliptic_curve::sec1::ToEncodedPoint;
use k256::{PublicKey, SecretKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

pub struct BridgeSession {
    /// bridge id = verifier (creator) compressed pubkey hex = QR `t`
    pub bridge_id: String,
    pub our_pubkey_hex: String,
    key: [u8; 32],
    nonce: [u8; 12],
}

fn hex_id(entropy: &[u8]) -> String {
    hex::encode(&entropy[..16])
}

impl BridgeSession {
    /// `verifier_pubkey_hex` = QR `p` (== `t`); `our_secret` = 32 random bytes
    /// from the platform (SecRandomCopyBytes etc.).
    pub fn new(verifier_pubkey_hex: &str, our_secret: &[u8; 32]) -> Result<Self, String> {
        let secret = SecretKey::from_slice(our_secret).map_err(|e| e.to_string())?;
        let remote = PublicKey::from_sec1_bytes(
            &hex::decode(verifier_pubkey_hex).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        // Raw compressed shared point, truncated to 32 bytes (TS: getSharedSecret().slice(0,32))
        let shared = diffie_hellman(secret.to_nonzero_scalar(), remote.as_affine());
        // k256's diffie_hellman returns only X; TS noble returns the compressed
        // point (parity ‖ X) — reconstruct it to match byte-for-byte.
        let shared_point = PublicKey::from_affine(
            (k256::ProjectivePoint::from(remote.as_affine()) * *secret.to_nonzero_scalar())
                .to_affine(),
        )
        .map_err(|e| e.to_string())?;
        let compressed = shared_point.to_encoded_point(true);
        let mut key = [0u8; 32];
        key.copy_from_slice(&compressed.as_bytes()[..32]);
        let _ = shared; // x-only variant unused; kept for clarity

        let our_pub = secret.public_key().to_encoded_point(true);
        let nonce_full = Sha256::digest(verifier_pubkey_hex.as_bytes());
        let mut nonce = [0u8; 12];
        nonce.copy_from_slice(&nonce_full[..12]);
        Ok(Self {
            bridge_id: verifier_pubkey_hex.to_string(),
            our_pubkey_hex: hex::encode(our_pub.as_bytes()),
            key,
            nonce,
        })
    }

    fn seal(&self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        Aes256Gcm::new((&self.key).into())
            .encrypt(Nonce::from_slice(&self.nonce), Payload::from(plaintext))
            .map_err(|e| e.to_string())
    }

    fn open(&self, ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        Aes256Gcm::new((&self.key).into())
            .decrypt(Nonce::from_slice(&self.nonce), Payload::from(ciphertext))
            .map_err(|e| e.to_string())
    }

    /// The websocket URL for the first connection (handshake in `moc`).
    pub fn connect_url(&self, base: &str, entropy: &[u8; 32]) -> Result<String, String> {
        let greeting = hex::encode(self.seal(b"hello")?);
        let handshake = json!({
            "jsonrpc": "2.0", "id": hex_id(entropy), "method": "handshake",
            "params": { "pubkey": self.our_pubkey_hex, "greeting": greeting },
        });
        let moc = B64.encode(handshake.to_string());
        let encoded: String = moc
            .bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    (b as char).to_string()
                }
                _ => format!("%{b:02X}"),
            })
            .collect();
        Ok(format!("{base}?id={}&v=1&moc={encoded}&ooc", self.bridge_id))
    }

    /// Build the outer JSON-RPC frame for an application message.
    /// Inner: deflate(params JSON) → base64 → chunk-tagged (single chunk; the
    /// clip's messages fit 16 KB), then AES-GCM, then the plaintext envelope.
    pub fn encrypt_message(
        &self,
        method: &str,
        params: &Value,
        entropy: &[u8; 32],
    ) -> Result<String, String> {
        Ok(self.encrypt_messages(method, params, entropy)?.remove(0))
    }

    /// One outer frame per 16 KB chunk of the deflated+base64 params
    /// (TS CHUNK_SIZE; frames above 32 KB are dropped by the transport).
    pub fn encrypt_messages(
        &self,
        method: &str,
        params: &Value,
        entropy: &[u8; 32],
    ) -> Result<Vec<String>, String> {
        const CHUNK_SIZE: usize = 16384;
        let frame = |inner: &Value, index: usize| -> Result<String, String> {
            let sealed = self.seal(inner.to_string().as_bytes())?;
            let mut id_src = Sha256::new();
            id_src.update(&entropy[16..]);
            id_src.update((index as u64).to_be_bytes());
            Ok(json!({
                "jsonrpc": "2.0", "id": hex::encode(&id_src.finalize()[..16]),
                "method": "encryptedMessage",
                "params": { "payload": B64.encode(sealed) },
            })
            .to_string())
        };
        if params.is_null() {
            return Ok(vec![frame(&json!({ "method": method, "params": {} }), 0)?]);
        }
        let raw = serde_json::to_vec(params).map_err(|e| e.to_string())?;
        let compressed = B64.encode(miniz_oxide::deflate::compress_to_vec_zlib(&raw, 6));
        let chunks: Vec<&str> = compressed
            .as_bytes()
            .chunks(CHUNK_SIZE)
            .map(|c| std::str::from_utf8(c).unwrap())
            .collect();
        let chunk_id = hex_id(entropy);
        let total = chunks.len();
        chunks
            .iter()
            .enumerate()
            .map(|(i, part)| {
                frame(
                    &json!({
                        "method": method,
                        "params": part,
                        "chunk": { "id": chunk_id, "index": i, "length": total },
                    }),
                    i,
                )
            })
            .collect()
    }

    /// Decrypt an incoming `encryptedMessage` frame → inner message with
    /// inflated params: {"method": ..., "params": ...}. Returns pass-through
    /// {"method":"ping"|...} for non-encrypted control frames.
    pub fn decrypt_frame(&self, frame: &str) -> Result<Value, String> {
        let outer: Value = serde_json::from_str(frame).map_err(|e| e.to_string())?;
        if outer["method"] != "encryptedMessage" {
            return Ok(outer);
        }
        let payload = outer["params"]["payload"]
            .as_str()
            .ok_or("missing payload")?;
        let plain = self.open(&B64.decode(payload).map_err(|e| e.to_string())?)?;
        let mut inner: Value = serde_json::from_slice(&plain).map_err(|e| e.to_string())?;
        if let Some(chunk) = inner.get("chunk") {
            if chunk["length"] == 1 {
                let data = B64
                    .decode(inner["params"].as_str().ok_or("missing params")?)
                    .map_err(|e| e.to_string())?;
                let inflated = miniz_oxide::inflate::decompress_to_vec_zlib(&data)
                    .map_err(|e| format!("{e:?}"))?;
                inner["params"] =
                    serde_json::from_slice(&inflated).map_err(|e| e.to_string())?;
            } else {
                return Err("multi-chunk messages not supported yet".into());
            }
        }
        Ok(inner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Known-answer vector generated from @obsidion/bridge's own encryption.ts
    /// (priv=0x07…, peer priv=0x09…): key, bridgeId, and AES-GCM("hello").
    #[test]
    fn matches_obsidion_bridge_ts() {
        let s = BridgeSession::new(
            "0256b328b30c8bf5839e24058747879408bdb36241dc9c2e7c619faa12b2920967",
            &[7u8; 32],
        )
        .unwrap();
        assert_eq!(
            hex::encode(s.key),
            "03f989420656df216794c7c591c40c2f9b7fb249e9ead3452217d9ec93217f94",
            "shared key (truncated compressed point incl. parity byte)"
        );
        assert_eq!(
            hex::encode(s.seal(b"hello").unwrap()),
            "72db6df8651ea177554399a55f9294837d6680b1de",
            "greeting ciphertext"
        );
    }

    // Round-trip with two sessions sharing the ECDH secret (creator side
    // simulated by swapping roles: same key derivation both ways).
    #[test]
    fn roundtrip_and_greeting() {
        let a_secret = [7u8; 32];
        let b_secret = [9u8; 32];
        let b_pub = hex::encode(
            SecretKey::from_slice(&b_secret)
                .unwrap()
                .public_key()
                .to_encoded_point(true)
                .as_bytes(),
        );
        let a = BridgeSession::new(&b_pub, &a_secret).unwrap();
        // Peer session: same bridge_id (nonce source) — derive from a's pubkey.
        let b = BridgeSession::new(&a.our_pubkey_hex, &b_secret).unwrap();
        // ECDH keys must agree even though nonce sources differ per direction —
        // emulate the shared session by copying a's nonce basis:
        let b = BridgeSession {
            bridge_id: a.bridge_id.clone(),
            our_pubkey_hex: b.our_pubkey_hex.clone(),
            key: b.key,
            nonce: a.nonce,
        };
        assert_eq!(a.key, b.key, "ECDH keys must match");

        let entropy = [3u8; 32];
        let frame = a
            .encrypt_message("proof", &json!({"proof": "abc", "index": 0, "total": 4}), &entropy)
            .unwrap();
        let inner = b.decrypt_frame(&frame).unwrap();
        assert_eq!(inner["method"], "proof");
        assert_eq!(inner["params"]["total"], 4);

        let url = a.connect_url("wss://bridge.zkpassport.id", &entropy).unwrap();
        assert!(url.contains("&moc=") && url.contains(&format!("id={b_pub}")));
    }
}

pub mod ffi;
