//! Aadhaar Secure QR: the ID data the disclosure proofs use and the inputs of the
//! `aadhaar_id` base proof, which stands in for the three chip base proofs.
//!
//! Port of `@zkpassport/utils` `src/circuits/aadhaar.ts`. The parsing follows the
//! `aadhaar` Noir library, which reads the fields as raw bytes.

use crate::barrett::redc_limbs_from_bytes;
use crate::bytes::{left_pad_with_zeros, right_pad_with_zeros};
use crate::commitments::{normalize_dg2_hash, IntegrityToDisclosureSalts};
use crate::dsc::PackagedCertsMeta;
use crate::merkle::compute_merkle_proof;
use crate::poseidon2::poseidon2_hash;
use crate::registry::{
    get_certificate_leaf_hash, get_certificate_type, hex_to_bytes, masterlist_tree_root,
    revocation_tree_root, tags_array_to_bits_flag, PackagedCertificate, PublicKey,
    CERTIFICATE_MERKLE_TREE_HEIGHT, CERT_TYPE_UIDAI,
};
use num_bigint::BigUint;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const AADHAAR_CIRCUIT_NAME: &str = "aadhaar_id";
pub const AADHAAR_MAX_DATA_LENGTH: usize = 2048;
pub const AADHAAR_MAX_PHOTO_LENGTH: usize = 1536;
pub const AADHAAR_SIGNATURE_LENGTH: usize = 256;
/// "AADHAAR"
pub const AADHAAR_NULLIFIER_DOMAIN: u64 = 0x41414448414152;
/// Aadhaar has no expiry, so the MRZ gets the signing date plus this many years.
pub const AADHAAR_VALIDITY_YEARS: u32 = 10;

const DELIMITER: u8 = 255;
const DELIMITER_COUNT: usize = 18;
const HEADER_SCAN_LENGTH: usize = 1024;
const NAME_MAX_LENGTH: usize = 64;
const MRZ_NAME_LENGTH: usize = 39;
const DG1_HEADER: [u8; 5] = [0x61, 0x5b, 0x5f, 0x1f, 0x58];
const SHA256_DIGEST_INFO: [u8; 19] = [
    0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
    0x00, 0x04, 0x20,
];
const MALFORMED: &str = "Malformed Aadhaar QR data";

/// What the proofs take from the signed QR data.
pub struct Aadhaar {
    /// The TD3 data group the circuit builds: its header and the 88 MRZ characters.
    pub dg1: Vec<u8>,
    /// SHA-256 of the photo, which stands in for the DG2 hash.
    pub photo_hash: Vec<u8>,
    /// The first delimiters' offsets, zero-padded to the circuit's 18.
    pub delimiter_indices: Vec<usize>,
    pub photo: std::ops::Range<usize>,
}

impl Aadhaar {
    pub fn mrz(&self) -> &str {
        std::str::from_utf8(&self.dg1[DG1_HEADER.len()..]).unwrap_or("")
    }

    /// `calculateAadhaarPrivateNullifier`
    pub fn private_nullifier(&self) -> BigUint {
        poseidon2_hash(&[
            BigUint::from(AADHAAR_NULLIFIER_DOMAIN),
            normalize_dg2_hash(&self.photo_hash),
        ])
    }
}

fn mrz_check_digit(chars: &[u8]) -> u8 {
    let sum: u32 = chars
        .iter()
        .enumerate()
        .map(|(i, &c)| {
            let value = match c {
                b'0'..=b'9' => c - b'0',
                b'A'..=b'Z' => c - b'A' + 10,
                _ => 0,
            };
            value as u32 * [7, 3, 1][i % 3]
        })
        .sum();
    b'0' + (sum % 10) as u8
}

fn name_to_mrz(name: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut after_separator = true;
    for &c in name.iter().take(NAME_MAX_LENGTH) {
        if c.is_ascii_alphabetic() {
            out.push(c.to_ascii_uppercase());
            after_separator = false;
        } else if matches!(c, b' ' | b'-' | b',') && !after_separator {
            out.push(b'<');
            after_separator = true;
        }
    }
    out.resize(MRZ_NAME_LENGTH, b'<');
    out
}

/// `parseAadhaarData` and `aadhaarToDg1`
pub fn parse_aadhaar(signed_data: &[u8]) -> Result<Aadhaar, String> {
    let v2 = signed_data.starts_with(&[b'V', b'2', DELIMITER]);
    let v1 = signed_data.len() > 1 && signed_data[0].is_ascii_digit() && signed_data[1] == DELIMITER;
    if !v2 && !v1 {
        return Err("Unsupported Aadhaar QR version".into());
    }
    let count = if v2 { DELIMITER_COUNT } else { DELIMITER_COUNT - 2 };
    let mut delimiter_indices: Vec<usize> = signed_data
        .iter()
        .enumerate()
        .filter(|(_, &b)| b == DELIMITER)
        .map(|(i, _)| i)
        .take(DELIMITER_COUNT)
        .collect();
    if delimiter_indices.len() < count || delimiter_indices[count - 1] >= HEADER_SCAN_LENGTH {
        return Err(MALFORMED.into());
    }
    let field = |position: usize| {
        let start = if position == 0 { 0 } else { delimiter_indices[position - 1] + 1 };
        &signed_data[start..delimiter_indices[position]]
    };
    let offset = usize::from(v2);
    let reference_id = field(offset + 1);
    let date_of_birth = field(offset + 3);
    let gender = field(offset + 4);
    let all_digits = |bytes: &[u8]| bytes.iter().all(u8::is_ascii_digit);
    if reference_id.len() < 12
        || !all_digits(&reference_id[..12])
        || date_of_birth.len() != 10
        || date_of_birth[2] != b'-'
        || date_of_birth[5] != b'-'
        || gender.len() != 1
    {
        return Err(MALFORMED.into());
    }
    let dob = [&date_of_birth[8..10], &date_of_birth[3..5], &date_of_birth[..2]].concat();
    if !all_digits(&dob) {
        return Err(MALFORMED.into());
    }
    let signing_year = (reference_id[6] - b'0') as u32 * 10 + (reference_id[7] - b'0') as u32;
    let expiry_year = (signing_year + AADHAAR_VALIDITY_YEARS) % 100;
    let mut expiry = vec![b'0' + (expiry_year / 10) as u8, b'0' + (expiry_year % 10) as u8];
    expiry.extend_from_slice(&reference_id[8..12]);

    let trailing_hashes = match (v2, signed_data[0]) {
        (true, _) | (false, b'0') => 0,
        (false, b'1' | b'2') => 32,
        (false, b'3') => 64,
        _ => return Err(MALFORMED.into()),
    };
    let photo = delimiter_indices[count - 1] + 1..signed_data.len().saturating_sub(trailing_hashes);
    if photo.is_empty() {
        return Err("The Aadhaar QR data has no photo".into());
    }
    if photo.len() > AADHAAR_MAX_PHOTO_LENGTH {
        return Err("The Aadhaar photo is larger than the circuit takes".into());
    }

    let mut mrz = b"IDIND".to_vec();
    mrz.extend(name_to_mrz(field(offset + 2)));
    let mut document_number = b"XXXXX".to_vec();
    document_number.extend_from_slice(&reference_id[..4]);
    mrz.extend_from_slice(&document_number);
    mrz.push(mrz_check_digit(&document_number));
    mrz.extend_from_slice(b"XXX");
    mrz.extend_from_slice(&dob);
    mrz.push(mrz_check_digit(&dob));
    mrz.push(if matches!(gender[0], b'M' | b'F') { gender[0] } else { b'<' });
    mrz.extend_from_slice(&expiry);
    mrz.push(mrz_check_digit(&expiry));
    mrz.extend_from_slice(&[b'<'; 14]);
    mrz.push(mrz_check_digit(&[b'<'; 14]));
    let composite = [&mrz[44..54], &mrz[57..64], &mrz[65..87]].concat();
    mrz.push(mrz_check_digit(&composite));

    let mut dg1 = DG1_HEADER.to_vec();
    dg1.extend(mrz);
    let photo_hash = Sha256::digest(&signed_data[photo.clone()]).to_vec();
    delimiter_indices.resize(DELIMITER_COUNT, 0);
    Ok(Aadhaar { dg1, photo_hash, delimiter_indices, photo })
}

fn modulus_of(cert: &PackagedCertificate) -> Option<Vec<u8>> {
    match &cert.public_key {
        PublicKey::Rsa { modulus, .. } => Some(hex_to_bytes(modulus)),
        PublicKey::Ec { .. } => None,
    }
}

/// `verifyAadhaarSignature`: RSA PKCS#1 v1.5 over SHA-256, public exponent 65537.
pub fn verify_aadhaar_signature(signed_data: &[u8], signature: &[u8], modulus: &[u8]) -> bool {
    let decrypted = BigUint::from_bytes_be(signature)
        .modpow(&BigUint::from(65537u32), &BigUint::from_bytes_be(modulus));
    let mut expected = vec![0x01];
    expected.resize(AADHAAR_SIGNATURE_LENGTH - 2 - SHA256_DIGEST_INFO.len() - 32, 0xff);
    expected.push(0x00);
    expected.extend_from_slice(&SHA256_DIGEST_INFO);
    expected.extend_from_slice(&Sha256::digest(signed_data));
    decrypted == BigUint::from_bytes_be(&expected)
}

/// The registry's UIDAI certificate whose key signed the QR data (`findUidaiPublicKey`).
pub fn find_uidai_certificate<'a>(
    certificates: &'a [PackagedCertificate],
    signed_data: &[u8],
    signature: &[u8],
) -> Option<&'a PackagedCertificate> {
    certificates.iter().find(|cert| {
        get_certificate_type(cert) == Ok(CERT_TYPE_UIDAI)
            && cert.country == "IND"
            && modulus_of(cert).is_some_and(|m| verify_aadhaar_signature(signed_data, signature, &m))
    })
}

/// `getAadhaarCircuitInputs`
pub fn get_aadhaar_circuit_inputs(
    signed_data: &[u8],
    signature: &[u8],
    aadhaar: &Aadhaar,
    certificate: &PackagedCertificate,
    meta: &PackagedCertsMeta,
    cert_leaves: &[BigUint],
    salts: &IntegrityToDisclosureSalts,
) -> Result<Value, String> {
    if meta.version != 1 {
        return Err(format!(
            "getAadhaarCircuitInputs requires v1 packaged certificates (got version {})",
            meta.version
        ));
    }
    if signed_data.len() > AADHAAR_MAX_DATA_LENGTH {
        return Err("The Aadhaar QR data is larger than the circuit takes".into());
    }
    let leaf = get_certificate_leaf_hash(certificate, CERT_TYPE_UIDAI, meta.version)?;
    let index = cert_leaves
        .iter()
        .position(|l| *l == leaf)
        .ok_or("The UIDAI key is not in the Certificate Registry")?;
    let merkle_proof = compute_merkle_proof(cert_leaves, index, CERTIFICATE_MERKLE_TREE_HEIGHT);
    let pubkey = left_pad_with_zeros(
        &modulus_of(certificate).ok_or("The UIDAI key is not an RSA key")?,
        AADHAAR_SIGNATURE_LENGTH,
    );
    // The salts are SHA-256 outputs and may exceed the field, so they go in reduced as the prover would
    let hex = |salt: &BigUint| format!("0x{:x}", BigUint::from(ark_bn254::Fr::from(salt.clone())));
    Ok(json!({
        "certificate_registry_root": meta.root,
        "schema_version": meta.version,
        "timestamp": meta.timestamp,
        "certificate_tree_index": merkle_proof["index"],
        "certificate_tree_hash_path": merkle_proof["path"],
        "certificate_tags": tags_array_to_bits_flag(certificate.tags.as_deref().unwrap_or(&[]))
            .iter().map(|tag| format!("0x{tag:x}")).collect::<Vec<_>>(),
        "uidai_cert_expiry": certificate.validity.not_after,
        "uidai_cert_fingerprint": certificate.fingerprint.as_ref().ok_or("certificate fingerprint required")?,
        "revocation_tree_root": revocation_tree_root(meta.revocations),
        "masterlist_tree_root": masterlist_tree_root(meta.masterlists),
        "qr_data": right_pad_with_zeros(signed_data, AADHAAR_MAX_DATA_LENGTH),
        "qr_data_length": signed_data.len(),
        "delimiter_indices": aadhaar.delimiter_indices,
        "signature": signature,
        "pubkey": pubkey,
        "pubkey_redc_param": left_pad_with_zeros(&redc_limbs_from_bytes(&pubkey), AADHAAR_SIGNATURE_LENGTH + 1),
        "dg1_salt": hex(&salts.dg1_salt),
        "expiry_date_salt": hex(&salts.expiry_date_salt),
        "dg2_hash_salt": hex(&salts.dg2_hash_salt),
        "private_nullifier_salt": hex(&salts.private_nullifier_salt),
    }))
}

/// `isAadhaarNationalityConditionAllowed`: Aadhaar records no nationality, so it can only pass
/// an exclusion list.
pub fn is_nationality_condition_allowed(query: &Value) -> bool {
    query["nationality"].as_object().is_none_or(|config| {
        config
            .iter()
            .all(|(key, value)| key == "out" || value == &json!(false))
    })
}
