//! DSC circuit input builder.
//!
//! Port of `getDSCCircuitInputs` from `@zkpassport/utils`
//! `src/circuit-matcher.ts`. Takes the already-matched CSCA certificate
//! (CSCA matching is a separate step) plus pre-extracted DSC fields.

use crate::barrett::redc_limbs_from_bytes;
use crate::bytes::{left_pad_with_zeros, right_pad_with_zeros};
use crate::curves;
use crate::id_data::get_tbs_max_len;
use crate::merkle::compute_merkle_proof;
use crate::registry::{
    get_certificate_leaf_hash, masterlist_tree_root, revocation_tree_root, hex_to_biguint,
    tags_array_to_bits_flag, PackagedCertificate, PublicKey, Revocation, CERT_TYPE_CSCA,
    CERTIFICATE_MERKLE_TREE_HEIGHT,
};
use crate::signature::process_ecdsa_signature;
use num_bigint::BigUint;
use serde_json::{json, Value};

fn hex_min(x: &BigUint) -> String {
    format!("0x{x:x}")
}

/// `Buffer.from(hex, "hex")`: decodes complete pairs, ignores a trailing odd nibble.
fn buffer_hex(hex: &str) -> Vec<u8> {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    hex.as_bytes()
        .chunks_exact(2)
        .map(|p| u8::from_str_radix(std::str::from_utf8(p).unwrap(), 16).expect("hex"))
        .collect()
}

/// Registry-file fields the builder needs (beyond the certificate list).
pub struct PackagedCertsMeta<'a> {
    pub version: u32,
    pub root: &'a str,
    pub timestamp: u64,
    pub revocations: &'a [Revocation],
    pub masterlists: &'a [String],
}

pub struct DscInput<'a> {
    /// DSC TBS certificate bytes, raw (unpadded).
    pub tbs_certificate: &'a [u8],
    /// Signature over the DSC by the CSCA, raw.
    pub dsc_signature: &'a [u8],
    /// RSA-PSS salt length when the CSCA signs with RSA-PSS (0 otherwise).
    pub pss_salt_len: u32,
}

pub fn get_dsc_circuit_inputs(
    input: &DscInput,
    salt: &BigUint,
    csca: &PackagedCertificate,
    meta: &PackagedCertsMeta,
    cert_leaves: &[BigUint],
) -> Result<Value, String> {
    if meta.version != 1 {
        return Err(format!(
            "getDSCCircuitInputs requires v1 packaged certificates (got version {})",
            meta.version
        ));
    }
    let csca_leaf = get_certificate_leaf_hash(csca, CERT_TYPE_CSCA, meta.version)?;
    let index = cert_leaves
        .iter()
        .position(|leaf| *leaf == csca_leaf)
        .ok_or("CSCA leaf not found in certificate tree")?;
    let tags = match &csca.tags {
        Some(t) => tags_array_to_bits_flag(t),
        None => tags_array_to_bits_flag(&[]),
    };
    let merkle_proof = compute_merkle_proof(cert_leaves, index, CERTIFICATE_MERKLE_TREE_HEIGHT);

    let fingerprint = csca
        .fingerprint
        .as_ref()
        .ok_or("certificate fingerprint required")?;

    let base = json!({
        "certificate_registry_root": meta.root,
        "schema_version": meta.version,
        "timestamp": meta.timestamp,
        "certificate_tree_index": merkle_proof["index"],
        "certificate_tree_hash_path": merkle_proof["path"],
        "certificate_tags": tags.iter().map(hex_min).collect::<Vec<_>>(),
        "certificate_type": hex_min(&BigUint::from(CERT_TYPE_CSCA)),
        "country": csca.country,
        "csc_expiry": csca.validity.not_after,
        "csc_fingerprint": fingerprint,
        "revocation_tree_root": revocation_tree_root(meta.revocations),
        "masterlist_tree_root": masterlist_tree_root(meta.masterlists),
        "salt": hex_min(salt),
    });
    let mut result = base;

    let max_tbs_length = get_tbs_max_len(input.tbs_certificate.len());
    let tbs_padded = right_pad_with_zeros(input.tbs_certificate, max_tbs_length);

    match &csca.public_key {
        PublicKey::Ec {
            curve,
            public_key_x,
            public_key_y,
        } => {
            let (bits, n_hex) =
                curves::curve_info(curve).ok_or_else(|| format!("unknown curve: {curve}"))?;
            let n = hex_to_biguint(n_hex);
            let byte_size = (bits as usize).div_ceil(8);
            let dsc_signature = process_ecdsa_signature(input.dsc_signature, byte_size, &n);
            let extra = json!({
                "csc_pubkey_x": buffer_hex(public_key_x),
                "csc_pubkey_y": buffer_hex(public_key_y),
                "dsc_signature": dsc_signature,
                "tbs_certificate": tbs_padded,
            });
            merge(&mut result, extra);
        }
        PublicKey::Rsa { modulus, exponent } => {
            let modulus_int = hex_to_biguint(modulus);
            let modulus_bits = modulus_int.bits() as usize;
            let modulus_bytes =
                left_pad_with_zeros(&modulus_int.to_bytes_be(), modulus_bits.div_ceil(8));
            let redc_param = left_pad_with_zeros(
                &redc_limbs_from_bytes(&modulus_bytes),
                modulus_bits.div_ceil(8) + 1,
            );
            let extra = json!({
                "tbs_certificate": tbs_padded,
                "dsc_signature": input.dsc_signature,
                "csc_pubkey": modulus_bytes,
                "csc_pubkey_redc_param": redc_param,
                "exponent": exponent,
                "pss_salt_len": input.pss_salt_len,
            });
            merge(&mut result, extra);
        }
    }
    Ok(result)
}

fn merge(base: &mut Value, extra: Value) {
    let (Value::Object(base), Value::Object(extra)) = (base, extra) else {
        unreachable!("merge expects objects");
    };
    for (k, v) in extra {
        base.insert(k, v);
    }
}
