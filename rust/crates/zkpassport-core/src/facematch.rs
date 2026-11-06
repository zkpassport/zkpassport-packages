//! FaceMatch App Attest circuit inputs (attestation-derived fields).
//!
//! Byte-identical port of the iOS path in the mobile app's
//! `src/services/facematch/circuit-input-generator.ts` (`generateCircuitInputsiOS`)
//! plus the helpers it calls in `utils.ts`
//! (`parseAppleKeyAttestation`, `getTbsBytes`, `getPublicKeyCoordinates`,
//! `getSignatureBytesFromCertificate`, `getEnvironmentFromAuthData`,
//! `getAppIdFromCertificate`, `parseAttestationClientData`,
//! `packAndHashPoseidon2`).
//!
//! Only the attestation/cert-derived fields are produced here; the base
//! disclosure inputs come from the existing `input_gen` path.

use crate::bytes::{left_pad_with_zeros, pack_le_bytes_into_field_elems};
use crate::curves::curve_info;
use crate::der::{Reader, Tlv};
use crate::poseidon2::poseidon2_hash;
use crate::signature::process_ecdsa_signature;
use num_bigint::BigUint;

/// Apple App Attest root CA public key, X ‖ Y (P-384, 48+48 bytes).
/// From `APPLE_AA_ROOT_CA_PUBKEY_X`/`_Y` in `types.ts`.
pub const APPLE_AA_ROOT_CA_PUBKEY_X: [u8; 48] = [
    69, 49, 225, 152, 181, 180, 236, 4, 218, 21, 2, 4, 87, 4, 237, 79, 135, 114, 114, 215, 97, 53,
    178, 97, 22, 207, 200, 139, 97, 93, 10, 0, 7, 25, 186, 105, 133, 141, 254, 119, 202, 163, 184,
    57, 224, 32, 221, 214,
];
pub const APPLE_AA_ROOT_CA_PUBKEY_Y: [u8; 48] = [
    86, 20, 20, 4, 112, 40, 49, 228, 63, 112, 184, 143, 214, 195, 148, 182, 8, 234, 43, 214, 174,
    97, 233, 245, 152, 193, 47, 70, 175, 82, 147, 114, 102, 229, 127, 20, 235, 97, 254, 197, 48,
    247, 20, 79, 83, 129, 46, 53,
];

/// AAGUIDs identifying the App Attest environment (`types.ts`).
const AAGUID_DEV: &[u8] = b"appattestdevelop"; // 97,112,112,97,116,116,101,115,116,100,101,118,101,108,111,112
const AAGUID_PROD: [u8; 16] = [97, 112, 112, 97, 116, 116, 101, 115, 116, 0, 0, 0, 0, 0, 0, 0];

/// Apple App Attest key-usage extension OID (`asn.ts` `OID_APPLE_AA_KEY_USAGE`).
const OID_APPLE_AA_KEY_USAGE: &str = "1.2.840.113635.100.8.5";

/// Attestation-derived facematch circuit inputs, all raw (unpadded).
#[derive(Debug, Clone)]
pub struct FacematchAttestationInputs {
    pub root_key: Vec<u8>,          // 96
    pub intermediate_sig: Vec<u8>,  // 96
    pub intermediate_tbs: Vec<u8>,  // raw TBS
    pub intermediate_key: Vec<u8>,  // 96 (P-384 x‖y)
    pub credential_sig: Vec<u8>,    // 96
    pub credential_tbs: Vec<u8>,    // raw TBS
    pub auth_data: Vec<u8>,         // raw
    pub client_data: Vec<u8>,       // raw (echoed from input)
    pub client_data_hash: Vec<u8>,  // 32 (poseidon2)
    pub environment: String,        // "development" | "production"
    pub app_id: String,
    pub facematch_mode: u8, // 1 regular, 2 strict
}

/// Build the attestation-derived facematch inputs from the raw Apple App Attest
/// attestation (CBOR) and the DER client_data. Mirrors `generateCircuitInputsiOS`.
pub fn facematch_attestation_inputs(
    attestation: &[u8],
    client_data: &[u8],
) -> Result<FacematchAttestationInputs, String> {
    let att = parse_apple_key_attestation(attestation)?;
    // x5c[0] = credential (leaf), x5c[1] = intermediate.
    if att.x5c.len() < 2 {
        return Err("attestation missing credential/intermediate cert".into());
    }
    let credential_der = &att.x5c[0];
    let intermediate_der = &att.x5c[1];

    let mut root_key = APPLE_AA_ROOT_CA_PUBKEY_X.to_vec();
    root_key.extend_from_slice(&APPLE_AA_ROOT_CA_PUBKEY_Y);

    let intermediate_sig = cert_signature_rs(intermediate_der)?;
    let intermediate_tbs = tbs_bytes(intermediate_der)?;
    let (ix, iy) = p384_pubkey_coords(intermediate_der)?;
    let mut intermediate_key = ix;
    intermediate_key.extend_from_slice(&iy);

    let credential_tbs = tbs_bytes(credential_der)?;
    let credential_sig = cert_signature_rs(credential_der)?;

    let auth_data = att.auth_data.clone();
    let client_data_hash = pack_and_hash_poseidon2(client_data);
    let environment = environment_from_auth_data(&att.auth_data)?;
    let app_id = app_id_from_certificate(credential_der)?;
    let facematch_mode = facematch_mode_from_client_data(client_data)?;

    Ok(FacematchAttestationInputs {
        root_key,
        intermediate_sig,
        intermediate_tbs,
        intermediate_key,
        credential_sig,
        credential_tbs,
        auth_data,
        client_data: client_data.to_vec(),
        client_data_hash,
        environment,
        app_id,
        facematch_mode,
    })
}

// ===== Apple attestation (CBOR) =====

struct AppleAttestation {
    x5c: Vec<Vec<u8>>,
    auth_data: Vec<u8>,
}

fn parse_apple_key_attestation(bytes: &[u8]) -> Result<AppleAttestation, String> {
    let (val, _) = cbor_read(bytes, 0)?;
    let map = val.as_map().ok_or("attestation: top-level not a map")?;
    let att_stmt = map_get(map, "attStmt")
        .and_then(Cbor::as_map)
        .ok_or("attestation: missing attStmt map")?;
    let x5c_arr = map_get(att_stmt, "x5c")
        .and_then(Cbor::as_array)
        .ok_or("attestation: missing x5c array")?;
    let mut x5c = Vec::with_capacity(x5c_arr.len());
    for c in x5c_arr {
        x5c.push(c.as_bytes().ok_or("attestation: x5c entry not bytes")?.to_vec());
    }
    let auth_data = map_get(map, "authData")
        .and_then(Cbor::as_bytes)
        .ok_or("attestation: missing authData")?
        .to_vec();
    Ok(AppleAttestation { x5c, auth_data })
}

#[allow(dead_code)] // Uint/Other are navigational variants not read for this structure
enum Cbor {
    Uint(u64),
    Bytes(Vec<u8>),
    Text(String),
    Array(Vec<Cbor>),
    Map(Vec<(Cbor, Cbor)>),
    Other,
}

impl Cbor {
    fn as_map(&self) -> Option<&Vec<(Cbor, Cbor)>> {
        if let Cbor::Map(m) = self {
            Some(m)
        } else {
            None
        }
    }
    fn as_array(&self) -> Option<&Vec<Cbor>> {
        if let Cbor::Array(a) = self {
            Some(a)
        } else {
            None
        }
    }
    fn as_bytes(&self) -> Option<&[u8]> {
        if let Cbor::Bytes(b) = self {
            Some(b)
        } else {
            None
        }
    }
    fn as_text(&self) -> Option<&str> {
        if let Cbor::Text(t) = self {
            Some(t)
        } else {
            None
        }
    }
}

fn map_get<'a>(map: &'a [(Cbor, Cbor)], key: &str) -> Option<&'a Cbor> {
    map.iter()
        .find(|(k, _)| k.as_text() == Some(key))
        .map(|(_, v)| v)
}

/// Minimal CBOR decoder (enough for the App Attest attestation: maps, arrays,
/// text/byte strings, unsigned ints; tags and simple/float values are skipped).
fn cbor_read(data: &[u8], pos: usize) -> Result<(Cbor, usize), String> {
    if pos >= data.len() {
        return Err("cbor: unexpected end".into());
    }
    let b = data[pos];
    let major = b >> 5;
    let info = b & 0x1f;
    let (arg, mut p) = cbor_arg(data, pos + 1, info)?;
    match major {
        0 => Ok((Cbor::Uint(arg), p)), // unsigned int
        1 => Ok((Cbor::Other, p)),     // negative int (unused)
        2 => {
            // byte string
            let end = p + arg as usize;
            if end > data.len() {
                return Err("cbor: byte string overruns".into());
            }
            Ok((Cbor::Bytes(data[p..end].to_vec()), end))
        }
        3 => {
            // text string
            let end = p + arg as usize;
            if end > data.len() {
                return Err("cbor: text string overruns".into());
            }
            let s = String::from_utf8(data[p..end].to_vec()).map_err(|_| "cbor: bad utf8")?;
            Ok((Cbor::Text(s), end))
        }
        4 => {
            // array
            let mut items = Vec::with_capacity(arg as usize);
            for _ in 0..arg {
                let (v, np) = cbor_read(data, p)?;
                items.push(v);
                p = np;
            }
            Ok((Cbor::Array(items), p))
        }
        5 => {
            // map
            let mut pairs = Vec::with_capacity(arg as usize);
            for _ in 0..arg {
                let (k, np) = cbor_read(data, p)?;
                let (v, np2) = cbor_read(data, np)?;
                pairs.push((k, v));
                p = np2;
            }
            Ok((Cbor::Map(pairs), p))
        }
        6 => {
            // tag: skip tag, decode following item
            cbor_read(data, p)
        }
        7 => {
            // simple / float: argument already consumed the payload bytes
            Ok((Cbor::Other, p))
        }
        _ => {
            let _ = &mut p;
            Err("cbor: invalid major type".into())
        }
    }
}

/// Reads the CBOR argument for additional-info `info`, returning (value, new_pos).
fn cbor_arg(data: &[u8], pos: usize, info: u8) -> Result<(u64, usize), String> {
    match info {
        0..=23 => Ok((info as u64, pos)),
        24 => take_uint(data, pos, 1),
        25 => take_uint(data, pos, 2),
        26 => take_uint(data, pos, 4),
        27 => take_uint(data, pos, 8),
        _ => Err("cbor: unsupported additional info".into()),
    }
}

fn take_uint(data: &[u8], pos: usize, n: usize) -> Result<(u64, usize), String> {
    if pos + n > data.len() {
        return Err("cbor: argument overruns".into());
    }
    let mut v: u64 = 0;
    for i in 0..n {
        v = (v << 8) | data[pos + i] as u64;
    }
    Ok((v, pos + n))
}

// ===== Certificate parsing (reuses der.rs) =====

/// `getTbsBytes`: the exact TBSCertificate TLV (tag+len+content) from a cert DER.
fn tbs_bytes(cert_der: &[u8]) -> Result<Vec<u8>, String> {
    let cert = Reader::new(cert_der).read()?;
    cert.expect_tag(0x30, "certificate")?;
    let tbs = cert
        .children()?
        .into_iter()
        .next()
        .ok_or("certificate: missing tbsCertificate")?;
    Ok(tbs.raw.to_vec())
}

/// `getPublicKeyCoordinates`: P-384 subjectPublicKey x/y (48 bytes each).
fn p384_pubkey_coords(cert_der: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let spki_key = subject_public_key_bits(cert_der)?;
    if spki_key.first() != Some(&0x04) {
        return Err("public key not uncompressed".into());
    }
    match spki_key.len() {
        97 => Ok((spki_key[1..49].to_vec(), spki_key[49..97].to_vec())),
        65 => Ok((spki_key[1..33].to_vec(), spki_key[33..65].to_vec())),
        n => Err(format!("unexpected public key length {n}")),
    }
}

/// subjectPublicKey BIT STRING bytes (after the unused-bits octet).
fn subject_public_key_bits(cert_der: &[u8]) -> Result<Vec<u8>, String> {
    let cert = Reader::new(cert_der).read()?;
    let tbs = child(&cert, 0, "tbsCertificate")?;
    // TBS children: version?[0], serial, sigAlg, issuer, validity, subject, spki, ...
    // SPKI is the first SEQUENCE child after `subject`; find it by position,
    // accounting for the optional explicit [0] version wrapper.
    let tbs_children = tbs.children()?;
    let base = if tbs_children.first().map(|c| c.tag) == Some(0xa0) {
        1
    } else {
        0
    };
    // index within TBS (0-based, after optional version): serial(0) sigAlg(1)
    // issuer(2) validity(3) subject(4) spki(5)
    let spki = tbs_children
        .get(base + 5)
        .ok_or("tbsCertificate: missing SPKI")?;
    spki.expect_tag(0x30, "SubjectPublicKeyInfo")?;
    let bit = spki
        .children()?
        .get(1)
        .ok_or("SPKI: missing subjectPublicKey")?
        .expect_tag(0x03, "subjectPublicKey")?
        .bit_string_bytes()?
        .to_vec();
    Ok(bit)
}

/// `getSignatureBytesFromCertificate` → ECDSA r‖s with canonical low-s (96 bytes P-384).
fn cert_signature_rs(cert_der: &[u8]) -> Result<Vec<u8>, String> {
    let cert = Reader::new(cert_der).read()?;
    let children = cert.children()?;
    let sig_bits = children
        .get(2)
        .ok_or("certificate: missing signatureValue")?
        .expect_tag(0x03, "signatureValue")?
        .bit_string_bytes()?;
    ecdsa_signature_bytes(sig_bits)
}

/// `getECDSASignatureBytes`: parse SEQUENCE{r,s}, strip one leading zero, left-pad
/// to the curve byte size, then low-s canonicalize via `process_ecdsa_signature`.
fn ecdsa_signature_bytes(sig_der: &[u8]) -> Result<Vec<u8>, String> {
    let seq = Reader::new(sig_der).read()?;
    seq.expect_tag(0x30, "ECDSA-Sig-Value")?;
    let parts = seq.children()?;
    if parts.len() != 2 {
        return Err("ECDSA signature: expected 2 integers".into());
    }
    let r_raw = parts[0].content;
    let s_raw = parts[1].content;
    let byte_size = {
        let l = r_raw.len();
        if (46..=50).contains(&l) {
            48
        } else if (30..=34).contains(&l) {
            32
        } else {
            return Err(format!("invalid signature integer length {l}"));
        }
    };
    let r = strip_leading_zero(r_raw);
    let s = strip_leading_zero(s_raw);
    let mut padded = left_pad_with_zeros(r, byte_size);
    padded.extend(left_pad_with_zeros(s, byte_size));
    let curve = if byte_size == 48 { "P-384" } else { "P-256" };
    let n_hex = curve_info(curve).ok_or("unknown curve")?.1;
    let n = BigUint::parse_bytes(n_hex.as_bytes(), 16).ok_or("bad curve order")?;
    Ok(process_ecdsa_signature(&padded, byte_size, &n))
}

fn strip_leading_zero(b: &[u8]) -> &[u8] {
    if b.first() == Some(&0) {
        &b[1..]
    } else {
        b
    }
}

/// `getEnvironmentFromAuthData`: AAGUID = authData[37..53].
fn environment_from_auth_data(auth_data: &[u8]) -> Result<String, String> {
    if auth_data.len() < 53 {
        return Err("authData too short for AAGUID".into());
    }
    let aaguid = &auth_data[37..53];
    if aaguid == AAGUID_DEV {
        Ok("development".into())
    } else if aaguid == AAGUID_PROD {
        Ok("production".into())
    } else {
        Err("invalid AAGUID".into())
    }
}

/// `getAppIdFromCertificate`: Apple key-usage extension → appId OCTET STRING at [1204].
fn app_id_from_certificate(cert_der: &[u8]) -> Result<String, String> {
    let cert = Reader::new(cert_der).read()?;
    let tbs = child(&cert, 0, "tbsCertificate")?;
    // extensions are wrapped in an explicit [3] = tag 0xa3.
    let ext_wrapper = tbs
        .children()?
        .into_iter()
        .find(|c| c.tag == 0xa3)
        .ok_or("certificate: no extensions")?;
    let extensions = Reader::new(ext_wrapper.content).read()?;
    extensions.expect_tag(0x30, "Extensions")?;
    for ext in extensions.children()? {
        let parts = ext.children()?;
        let Some(oid_tlv) = parts.first() else {
            continue;
        };
        if oid_tlv.tag != 0x06 || oid_tlv.as_oid()? != OID_APPLE_AA_KEY_USAGE {
            continue;
        }
        let value = parts
            .iter()
            .find(|p| p.tag == 0x04)
            .ok_or("app-attest ext: missing value")?;
        return extract_app_id(value.content);
    }
    Err("app-attest key-usage extension not found".into())
}

/// Inside the extension value, appId is `[1204]` (tag bytes BF 89 34) wrapping an
/// OCTET STRING (04 len) with the UTF-8 app id.
fn extract_app_id(ext_value: &[u8]) -> Result<String, String> {
    let tag: [u8; 3] = [0xbf, 0x89, 0x34];
    let mut i = 0usize;
    while i + 3 <= ext_value.len() {
        if ext_value[i..i + 3] == tag {
            let mut p = i + 3;
            // [1204] length (single byte is sufficient for app ids)
            if p >= ext_value.len() {
                break;
            }
            let _ctx_len = ext_value[p] as usize;
            p += 1;
            // inner OCTET STRING: 04 <len> <bytes>
            if p + 2 > ext_value.len() || ext_value[p] != 0x04 {
                return Err("appId: expected OCTET STRING".into());
            }
            let len = ext_value[p + 1] as usize;
            let start = p + 2;
            if start + len > ext_value.len() {
                return Err("appId: length overruns".into());
            }
            return String::from_utf8(ext_value[start..start + len].to_vec())
                .map_err(|_| "appId: bad utf8".into());
        }
        i += 1;
    }
    Err("appId [1204] not found in extension".into())
}

/// `parseAttestationClientData(...).attestationData.faceMatch.mode`.
/// client_data = SEQUENCE { version, appVersion, attestationType, faceMatch [1] SEQ { mode ENUM, ... } }
fn facematch_mode_from_client_data(client_data: &[u8]) -> Result<u8, String> {
    let outer = Reader::new(client_data).read()?;
    outer.expect_tag(0x30, "ZKPassportAppAttest")?;
    let face_match = outer
        .children()?
        .into_iter()
        .find(|c| c.tag == 0xa1) // [1] explicit
        .ok_or("client_data: faceMatch [1] not found")?;
    let fm_seq = face_match
        .children()?
        .into_iter()
        .next()
        .ok_or("client_data: faceMatch empty")?;
    fm_seq.expect_tag(0x30, "FaceMatchAttestation")?;
    let mode = fm_seq
        .children()?
        .into_iter()
        .next()
        .ok_or("client_data: missing mode")?;
    mode.expect_tag(0x0a, "mode")?; // ENUMERATED
    Ok(mode.as_u64()? as u8)
}

/// `packAndHashPoseidon2`: pack LE into 31-byte field chunks, poseidon2-hash,
/// return big-endian bytes. (Also the hash the clip passes to App Attest `attestKey`.)
pub fn pack_and_hash_poseidon2(input: &[u8]) -> Vec<u8> {
    let fields = pack_le_bytes_into_field_elems(input, 31);
    poseidon2_hash(&fields).to_bytes_be()
}

fn child<'a>(tlv: &Tlv<'a>, idx: usize, what: &str) -> Result<Tlv<'a>, String> {
    tlv.children()?
        .into_iter()
        .nth(idx)
        .ok_or_else(|| format!("{what}: missing child {idx}"))
}

// ---- client_data (ZKPassportAppAttest) DER serializer ----
// Byte-identical to `serializeAttestation` (utils.ts, via @peculiar AsnSerializer) /
// `FaceMatchService.createAttestationClientData` (facematch.ts). The clip BUILDS this to
// App-Attest-sign it. version=1, attestationType=faceMatch(1).

/// Hash OID content bytes by digest length (`getHashAlgorithmOID`, facematch.ts).
fn hash_oid_by_len(len: usize) -> Result<&'static [u8], String> {
    Ok(match len {
        20 => &[0x2b, 0x0e, 0x03, 0x02, 0x1a], // SHA-1
        28 => &[0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x04], // SHA-224
        32 => &[0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01], // SHA-256
        48 => &[0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02], // SHA-384
        64 => &[0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03], // SHA-512
        n => return Err(format!("unsupported digest length {n}")),
    })
}

fn der_len(len: usize) -> Vec<u8> {
    if len < 0x80 {
        return vec![len as u8];
    }
    let mut b = Vec::new();
    let mut n = len;
    while n > 0 {
        b.push((n & 0xff) as u8);
        n >>= 8;
    }
    b.reverse();
    let mut out = vec![0x80 | b.len() as u8];
    out.extend_from_slice(&b);
    out
}

fn tlv_bytes(tag: u8, content: &[u8]) -> Vec<u8> {
    let mut out = vec![tag];
    out.extend_from_slice(&der_len(content.len()));
    out.extend_from_slice(content);
    out
}

/// Minimal two's-complement DER INTEGER/ENUMERATED content (matches AsnIntegerConverter).
fn der_int_content(v: i64) -> Vec<u8> {
    let mut bytes = v.to_be_bytes().to_vec();
    if v >= 0 {
        while bytes.len() > 1 && bytes[0] == 0x00 && bytes[1] & 0x80 == 0 {
            bytes.remove(0);
        }
    } else {
        while bytes.len() > 1 && bytes[0] == 0xff && bytes[1] & 0x80 != 0 {
            bytes.remove(0);
        }
    }
    bytes
}

/// Build the ZKPassportAppAttest DER `client_data`.
/// `cosine`/`threshold` are the CosineScore integers (cosine × 10^8).
pub fn build_facematch_client_data(
    app_version: &str,
    mode: u8,
    dg2_hash_digest: &[u8],
    dg2_faceprint_hash: &[u8],
    cosine: i64,
    threshold: Option<i64>,
) -> Result<Vec<u8>, String> {
    if dg2_faceprint_hash.is_empty() {
        return Err("dg2_faceprint_hash is empty".into());
    }
    // DigestInfo { AlgorithmIdentifier { OID }, OCTET digest }
    let mut digest_info = tlv_bytes(0x30, &tlv_bytes(0x06, hash_oid_by_len(dg2_hash_digest.len())?));
    digest_info.extend_from_slice(&tlv_bytes(0x04, dg2_hash_digest));
    let digest_info = tlv_bytes(0x30, &digest_info);

    // FaceMatchAttestation { mode, dg2Hash, dg2FaceprintHash, cosine, threshold? }
    let mut fm = tlv_bytes(0x0a, &der_int_content(mode as i64));
    fm.extend_from_slice(&digest_info);
    fm.extend_from_slice(&tlv_bytes(0x04, dg2_faceprint_hash));
    fm.extend_from_slice(&tlv_bytes(0x02, &der_int_content(cosine)));
    if let Some(t) = threshold {
        fm.extend_from_slice(&tlv_bytes(0x02, &der_int_content(t)));
    }
    let att_data = tlv_bytes(0xa1, &tlv_bytes(0x30, &fm)); // attestationData [1] EXPLICIT FaceMatch

    // ZKPassportAppAttest { version=1, appVersion, attestationType=faceMatch(1), attestationData }
    let mut top = tlv_bytes(0x02, &der_int_content(1));
    top.extend_from_slice(&tlv_bytes(0x0c, app_version.as_bytes()));
    top.extend_from_slice(&tlv_bytes(0x0a, &der_int_content(1)));
    top.extend_from_slice(&att_data);
    Ok(tlv_bytes(0x30, &top))
}

/// `hashFaceprintPoseidon2` (utils.ts): serialize 512 floats as big-endian f32
/// (normalizing -0 → +0), then the same pack+poseidon2 as `pack_and_hash_poseidon2`.
pub fn hash_faceprint_poseidon2(faceprint: &[f32]) -> Result<Vec<u8>, String> {
    if faceprint.len() != 512 {
        return Err(format!("expected 512 values, got {}", faceprint.len()));
    }
    let mut buf = Vec::with_capacity(512 * 4);
    for &x in faceprint {
        if !x.is_finite() {
            return Err("non-finite".into());
        }
        let x = if x == 0.0 { 0.0f32 } else { x }; // -0.0 → +0.0
        buf.extend_from_slice(&x.to_be_bytes());
    }
    Ok(pack_and_hash_poseidon2(&buf))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn fixture() -> (Vec<u8>, Vec<u8>) {
        let raw = include_str!("../tests/fixtures/facematch-attestation.json");
        let v: Value = serde_json::from_str(raw).unwrap();
        let att = base64_decode(v["attestation"].as_str().unwrap());
        let cd = base64_decode(v["client_data"].as_str().unwrap());
        (att, cd)
    }

    // Minimal std base64 decode (no external dep).
    fn base64_decode(s: &str) -> Vec<u8> {
        const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut lut = [255u8; 256];
        for (i, &c) in T.iter().enumerate() {
            lut[c as usize] = i as u8;
        }
        let mut bits = 0u32;
        let mut nbits = 0;
        let mut out = Vec::new();
        for &c in s.as_bytes() {
            if c == b'=' || c == b'\n' || c == b'\r' {
                continue;
            }
            let v = lut[c as usize];
            if v == 255 {
                continue;
            }
            bits = (bits << 6) | v as u32;
            nbits += 6;
            if nbits >= 8 {
                nbits -= 8;
                out.push((bits >> nbits) as u8);
            }
        }
        out
    }

    // Ground truth from /tmp/facematch-oracle.json (TS `generateCircuitInputsiOS` path).
    const ROOT_KEY: &str = "4531e198b5b4ec04da1502045704ed4f877272d76135b26116cfc88b615d0a000719ba69858dfe77caa3b839e020ddd656141404702831e43f70b88fd6c394b608ea2bd6ae61e9f598c12f46af52937266e57f14eb61fec530f7144f53812e35";
    const INTERMEDIATE_SIG: &str = "bbbe888d738d0502cfbcfd666d09575035bcd6872c3f8430492629edd1f914e879991c9ae8b5aef8d3a85433f7b60d0654c7122f337e12ff5bad3c45bb066c9c9aac0133d680d14ae7c3eec399ec6328bebdc2303ab7a3427d7411af7430efbc";
    const INTERMEDIATE_KEY: &str = "ae5b37a0774d79b2358f40e7d1f22626f1c25fef17802deab3826a59874ff8d2ad1525789aa26604191248b63cb967069e98d363bd5e370fbfa08e329e8073a985e7746ea359a2f66f29db32af455e211658d567af9e267eb2614dc21a66ce99";
    const CREDENTIAL_SIG: &str = "deb211df7af052de1c65c39cd0141ed57bfff4a0db5ec8df2b9dd1c0569472ad0c951b0c8df28a946527d7995f082e323a1243246c41776dcd723f9eae779e3949f93394588181ccba7ff238e4075c607b4baa8e58be451e161952460f6fdaf3";
    const AUTH_DATA: &str = "88a4f24d240da6753f7c61f0b3a145a0c3c3ac06b29a235fe4a7b0ee0d2531874000000000617070617474657374646576656c6f7000209351850a467772fab8af9071eb34536bea9bef33899e0f31e4ef5077e42ee692a5010203262001215820b6e9e3ea15be95878f35fd3a7597838b912fededfa6997d4b316b3e082832140225820e8be579542edcbc9e964fcbf2037660e71f245f22b715c0cc792e2e20d1f8909";
    const CLIENT_DATA: &str = "30730201010c05312e322e330a0101a16430620a0101302f300b06096086480165030402010420020202020202020202020202020202020202020202020202020202020202020204202a3c2e746feb933a346bc4ee749830524d4ae5e952ef6a5d0a78f0fe28300a160204053469bd0204047868c0";

    #[test]
    fn facematch_oracle_matches_ts() {
        let (att, cd) = fixture();
        let out = facematch_attestation_inputs(&att, &cd).unwrap();

        assert_eq!(hex::encode(&out.root_key), ROOT_KEY, "root_key");
        assert_eq!(hex::encode(&out.intermediate_sig), INTERMEDIATE_SIG, "intermediate_sig");
        assert_eq!(out.intermediate_tbs.len(), 460, "intermediate_tbs len");
        assert_eq!(hex::encode(&out.intermediate_tbs[..16]), "308201c8a003020102021009bac5e1bc", "intermediate_tbs head");
        assert_eq!(hex::encode(&out.intermediate_key), INTERMEDIATE_KEY, "intermediate_key");
        assert_eq!(hex::encode(&out.credential_sig), CREDENTIAL_SIG, "credential_sig");
        assert_eq!(out.credential_tbs.len(), 852, "credential_tbs len");
        assert_eq!(hex::encode(&out.credential_tbs[..16]), "30820350a00302010202060198ff18e4", "credential_tbs head");
        assert_eq!(hex::encode(&out.auth_data), AUTH_DATA, "auth_data");
        assert_eq!(hex::encode(&out.client_data), CLIENT_DATA, "client_data");
        assert_eq!(
            out.client_data_hash,
            vec![
                8, 71, 244, 120, 179, 241, 77, 66, 153, 186, 194, 188, 48, 139, 84, 103, 205, 188,
                239, 220, 135, 100, 215, 182, 18, 91, 192, 42, 69, 25, 59, 18
            ],
            "client_data_hash"
        );
        assert_eq!(out.environment, "development");
        assert_eq!(out.app_id, "YL5MS3Z639.app.zkpassport.appattest-prototype");
        assert_eq!(out.facematch_mode, 1);
    }

    #[test]
    fn client_data_serializer_matches_fixture() {
        // Exact field values decoded from the fixture client_data.
        let digest = [0x02u8; 32];
        let faceprint =
            hex::decode("2a3c2e746feb933a346bc4ee749830524d4ae5e952ef6a5d0a78f0fe28300a16").unwrap();
        let cd = build_facematch_client_data(
            "1.2.3",
            1,
            &digest,
            &faceprint,
            87321021,        // cosineAvgSimilarity (0x053469bd)
            Some(75000000),  // cosineThreshold (0x047868c0)
        )
        .unwrap();
        assert_eq!(hex::encode(&cd), CLIENT_DATA, "serialized client_data");
    }

    #[test]
    fn facematch_circuit_inputs_shape() {
        use crate::commitments::IntegrityToDisclosureSalts;
        use crate::disclosure::{get_facematch_circuit_inputs, DisclosureInput};
        use num_bigint::BigUint;
        let (att, cd) = fixture();
        let input = DisclosureInput {
            dg1: &[0u8; 95],
            e_content: &[0u8; 200],
            sod_signature_processed: &[0u8; 64],
            dg2_hash: &[2u8; 32],
            expiry_date: "350101",
            mrz: "",
        };
        let salts = IntegrityToDisclosureSalts {
            dg1_salt: BigUint::from(1u8),
            expiry_date_salt: BigUint::from(2u8),
            dg2_hash_salt: BigUint::from(3u8),
            private_nullifier_salt: BigUint::from(4u8),
        };
        let z = BigUint::from(0u8);
        let out =
            get_facematch_circuit_inputs(&input, &salts, &z, &z, &z, 1_789_000_000, &att, &cd).unwrap();
        let obj = out.as_object().unwrap();
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort_unstable();
        let mut expect = vec![
            "app_id", "auth_data", "client_data", "comm_in", "credential_sig", "credential_tbs",
            "current_date", "environment", "facematch_mode", "intermediate_key", "intermediate_sig",
            "intermediate_tbs", "nullifier_secret", "root_key", "salted_dg1", "salted_dg2_hash",
            "salted_dg2_hash_type", "salted_expiry_date", "salted_private_nullifier", "service_scope",
            "service_subscope",
        ];
        expect.sort_unstable();
        assert_eq!(keys, expect, "exact top-level keys (no oprf_proof/data)");
        let n = |k: &str| obj[k].as_array().unwrap().len();
        assert_eq!(n("root_key"), 96);
        assert_eq!(n("intermediate_key"), 96);
        assert_eq!(n("intermediate_tbs"), 500);
        assert_eq!(n("intermediate_sig"), 96);
        assert_eq!(n("credential_tbs"), 1000);
        assert_eq!(n("credential_sig"), 96);
        assert_eq!(n("auth_data"), 180);
        assert_eq!(n("client_data"), 169);
        assert_eq!(n("app_id"), 100);
        assert_eq!(obj["environment"].as_u64().unwrap(), 0); // fixture = development
        assert_eq!(obj["facematch_mode"].as_u64().unwrap(), 1);
    }

    #[test]
    fn faceprint_hash_matches_ts() {
        // Same deterministic input as the TS oracle (i-256)*0.013, [7] = -0.
        let mut fp: Vec<f32> = (0..512).map(|i| ((i as f64 - 256.0) * 0.013) as f32).collect();
        fp[7] = -0.0;
        let h = hash_faceprint_poseidon2(&fp).unwrap();
        assert_eq!(
            hex::encode(&h),
            "0ee12fe7a3afd041a59126ce7f004bb0606367db1055d6a2bb37f576da05c394",
        );
    }
}
