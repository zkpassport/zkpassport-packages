//! Packaged-certificates registry: leaf hashing and tree roots.
//!
//! Port of the relevant parts of `@zkpassport/utils` `src/registry/index.ts`
//! (v0/v1 certificate leaf hash, tags bit-flags, revocation leaf hash, and
//! the revocation/masterlist tree roots used by the DSC circuit inputs).

use crate::bytes::pack_be_bytes_into_field_elems;
use crate::merkle::MerkleTree;
use crate::poseidon2::poseidon2_hash;
use num_bigint::BigUint;
use serde::Deserialize;

pub const CERT_TYPE_CSCA: u8 = 1;
pub const CERT_TYPE_DSC: u8 = 2;
pub const CERTIFICATE_MERKLE_TREE_HEIGHT: usize = 16;
pub const REVOCATION_MERKLE_TREE_HEIGHT: usize = 14;
pub const MASTERLIST_MERKLE_TREE_HEIGHT: usize = 8;

#[derive(Deserialize, Clone)]
pub struct Validity {
    #[serde(default)]
    pub not_before: Option<u64>,
    pub not_after: u64,
}

#[derive(Deserialize, Clone)]
#[serde(tag = "type")]
pub enum PublicKey {
    #[serde(rename = "RSA")]
    Rsa {
        /// 0x-prefixed hex
        modulus: String,
        exponent: u64,
    },
    #[serde(rename = "EC")]
    Ec {
        curve: String,
        /// 0x-prefixed hex
        public_key_x: String,
        /// 0x-prefixed hex
        public_key_y: String,
    },
}

#[derive(Deserialize, Clone)]
pub struct PackagedCertificate {
    pub country: String,
    pub public_key: PublicKey,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub fingerprint: Option<String>,
    pub validity: Validity,
    #[serde(default)]
    pub signature_algorithm: Option<String>,
    #[serde(default)]
    pub subject_key_identifier: Option<String>,
}

/// AKI/SKI CSCA matching (the primary path of TS `getCscaCandidates`):
/// filter to same-country certificates, then require exactly one whose
/// subject_key_identifier equals the DSC's authorityKeyIdentifier.
/// (The TS signature-verification fallback is not ported yet.)
pub fn match_csca<'a>(
    certificates: &'a [PackagedCertificate],
    dsc_country: &str,
    authority_key_identifier: Option<&str>,
) -> Option<&'a PackagedCertificate> {
    let country = dsc_country.to_lowercase();
    let country_certs: Vec<&PackagedCertificate> = certificates
        .iter()
        .filter(|c| c.country.to_lowercase() == country)
        .collect();
    let aki = authority_key_identifier?.trim_start_matches("0x").to_lowercase();
    let matches: Vec<&&PackagedCertificate> = country_certs
        .iter()
        .filter(|c| {
            c.subject_key_identifier
                .as_deref()
                .map(|ski| ski.trim_start_matches("0x").to_lowercase() == aki)
                .unwrap_or(false)
        })
        .collect();
    if matches.len() == 1 {
        Some(matches[0])
    } else {
        None
    }
}

#[derive(Deserialize)]
pub struct Revocation {
    /// 0x-prefixed hex
    pub fingerprint: String,
    /// 0x-prefixed hex
    pub serial: String,
}

/// `Binary.from("<hex>")`: strip 0x, left-pad to even length, decode.
pub fn hex_to_bytes(hex: &str) -> Vec<u8> {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    let padded = if hex.len() % 2 == 1 {
        format!("0{hex}")
    } else {
        hex.to_string()
    };
    (0..padded.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&padded[i..i + 2], 16).expect("hex"))
        .collect()
}

pub fn hex_to_biguint(hex: &str) -> BigUint {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    BigUint::parse_bytes(hex.as_bytes(), 16).expect("hex bigint")
}

/// `tagsArrayToBitsFlag` — 26² possible two-letter tags over 253-bit limbs (3 fields).
pub fn tags_array_to_bits_flag(tags: &[String]) -> Vec<BigUint> {
    const BIT_SIZE: usize = 253;
    let num_limbs = (26 * 26usize).div_ceil(BIT_SIZE);
    let mut flags = vec![BigUint::from(0u8); num_limbs];
    for tag in tags {
        let b = tag.as_bytes();
        let bit_index = (b[0] - b'A') as usize * 26 + (b[1] - b'A') as usize;
        flags[bit_index / BIT_SIZE] |= BigUint::from(1u8) << (bit_index % BIT_SIZE);
    }
    flags
}

/// `publicKeyToBytes`
pub fn public_key_to_bytes(pk: &PublicKey) -> Vec<u8> {
    match pk {
        PublicKey::Rsa { modulus, .. } => hex_to_bytes(modulus),
        PublicKey::Ec {
            public_key_x,
            public_key_y,
            ..
        } => {
            let mut out = hex_to_bytes(public_key_x);
            out.extend(hex_to_bytes(public_key_y));
            out
        }
    }
}

/// JS `>>` operates on ToInt32; replicate the 4 expiry bytes exactly.
fn expiry_bytes(not_after: u64) -> [u8; 4] {
    let v = (not_after % (1u64 << 32)) as u32;
    v.to_be_bytes()
}

/// `getCertificateLeafHash` (versions 0 and 1).
pub fn get_certificate_leaf_hash(
    cert: &PackagedCertificate,
    cert_type: u8,
    version: u32,
) -> Result<BigUint, String> {
    let tags = match &cert.tags {
        Some(t) => tags_array_to_bits_flag(t),
        None => vec![BigUint::from(0u8); 3],
    };
    if tags.len() != 3 {
        return Err("tags must be exactly 3 fields".into());
    }
    if cert.country.len() != 3 {
        return Err(format!("country code must be 3 characters: {}", cert.country));
    }
    let c = cert.country.as_bytes();
    let public_key_bytes = public_key_to_bytes(&cert.public_key);

    let mut inputs = tags;
    match version {
        0 => {
            let header = [cert_type, c[0], c[1], c[2]];
            inputs.push(pack_be_bytes_into_field_elems(&header, 31)[0].clone());
            inputs.extend(pack_be_bytes_into_field_elems(&public_key_bytes, 31));
        }
        1 => {
            let fingerprint = cert
                .fingerprint
                .as_ref()
                .ok_or("certificate fingerprint required")?;
            let e = expiry_bytes(cert.validity.not_after);
            let header = [cert_type, c[0], c[1], c[2], e[0], e[1], e[2], e[3]];
            inputs.push(pack_be_bytes_into_field_elems(&header, 31)[0].clone());
            inputs.push(hex_to_biguint(fingerprint));
            inputs.extend(pack_be_bytes_into_field_elems(&public_key_bytes, 31));
        }
        v => return Err(format!("unsupported packaged certificates version: {v}")),
    }
    Ok(poseidon2_hash(&inputs))
}

/// `getCertificateLeafHashes` — leaf hashes sorted ascending.
pub fn get_certificate_leaf_hashes(
    certs: &[PackagedCertificate],
    version: u32,
) -> Result<Vec<BigUint>, String> {
    let mut leaves = certs
        .iter()
        .map(|c| get_certificate_leaf_hash(c, CERT_TYPE_CSCA, version))
        .collect::<Result<Vec<_>, _>>()?;
    leaves.sort();
    Ok(leaves)
}

/// `getRevocationLeafHash`
pub fn get_revocation_leaf_hash(rev: &Revocation) -> BigUint {
    let serial_bytes = hex_to_bytes(&rev.serial);
    let serial_hash = poseidon2_hash(&pack_be_bytes_into_field_elems(&serial_bytes, 31));
    poseidon2_hash(&[hex_to_biguint(&rev.fingerprint), serial_hash])
}

/// Root of `buildMerkleTreeFromRevocations`, formatted 0x + 64-char hex.
pub fn revocation_tree_root(revocations: &[Revocation]) -> String {
    let mut leaves: Vec<BigUint> = revocations.iter().map(get_revocation_leaf_hash).collect();
    leaves.sort();
    MerkleTree::new(REVOCATION_MERKLE_TREE_HEIGHT, BigUint::from(0u8), &leaves).root_hex_padded()
}

/// Root of `buildMerkleTreeFromMasterlists`, formatted 0x + 64-char hex.
pub fn masterlist_tree_root(masterlists: &[String]) -> String {
    let mut leaves: Vec<BigUint> = masterlists.iter().map(|h| hex_to_biguint(h)).collect();
    leaves.sort();
    MerkleTree::new(MASTERLIST_MERKLE_TREE_HEIGHT, BigUint::from(0u8), &leaves).root_hex_padded()
}
