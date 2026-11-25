//! End-to-end input generation: raw chip data → all four circuit input sets
//! (dsc, id_data, integrity, age) for the base + age-disclosure PoC.
//!
//! Composes the ported builders exactly as the TS ProofService pipeline does.

use crate::aadhaar;
use crate::bytes::right_pad_with_zeros;
use crate::commitments::IntegrityToDisclosureSalts;
use crate::curves;
use crate::disclosure::DisclosureInput;
use crate::dsc::{get_dsc_circuit_inputs, DscInput, PackagedCertsMeta};
use crate::id_data::{get_id_data_circuit_inputs, DscPublicKey, IdDataInput};
use crate::integrity::{get_integrity_check_circuit_inputs, IntegrityInputData, DG1_INPUT_SIZE};
use crate::registry::{hex_to_biguint, PackagedCertificate};
use crate::signature::process_ecdsa_signature;
use crate::sod::{parse_sod, ParsedSod, SodPublicKey};
use num_bigint::BigUint;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// Hash a raw data group with the SOD's data-group hash algorithm
/// (TS names like "SHA-256").
pub fn hash_data_group(data: &[u8], dg_hash_alg: &str) -> Result<Vec<u8>, String> {
    use sha2::digest::DynDigest;
    let mut hasher: Box<dyn DynDigest> = match dg_hash_alg.to_uppercase().replace("-", "").as_str()
    {
        "SHA1" => Box::new(sha1::Sha1::default()),
        "SHA224" => Box::new(sha2::Sha224::default()),
        "SHA256" => Box::new(Sha256::default()),
        "SHA384" => Box::new(sha2::Sha384::default()),
        "SHA512" => Box::new(sha2::Sha512::default()),
        other => return Err(format!("unsupported data group hash algorithm: {other}")),
    };
    hasher.update(data);
    Ok(hasher.finalize().to_vec())
}

/// `getScopeHash` / `getServiceScopeHash`: sha256 truncated to 31 bytes.
pub fn scope_hash(value: &str) -> BigUint {
    if value.is_empty() {
        return BigUint::from(0u8);
    }
    let digest = Sha256::digest(value.as_bytes());
    BigUint::from_bytes_be(&digest[..31])
}

/// Extract the MRZ string from raw DG1 bytes (61 L 5F1F L <mrz>).
pub fn mrz_from_dg1(dg1: &[u8]) -> Result<String, String> {
    if dg1.first() != Some(&0x61) {
        return Err("DG1 does not start with tag 0x61".into());
    }
    let (mut pos, _outer_len) = read_len(dg1, 1)?;
    if dg1.get(pos) != Some(&0x5f) || dg1.get(pos + 1) != Some(&0x1f) {
        return Err("DG1 missing MRZ tag 0x5F1F".into());
    }
    let (start, len) = read_len(dg1, pos + 2)?;
    pos = start;
    let mrz = dg1
        .get(pos..pos + len)
        .ok_or("DG1 MRZ exceeds buffer")?;
    Ok(String::from_utf8_lossy(mrz).to_string())
}

fn read_len(data: &[u8], at: usize) -> Result<(usize, usize), String> {
    let first = *data.get(at).ok_or("truncated length")?;
    if first & 0x80 == 0 {
        return Ok((at + 1, first as usize));
    }
    let n = (first & 0x7f) as usize;
    if n == 0 || n > 2 {
        return Err("unsupported DG1 length".into());
    }
    let mut len = 0usize;
    for i in 0..n {
        len = (len << 8) | *data.get(at + 1 + i).ok_or("truncated length")? as usize;
    }
    Ok((at + 1 + n, len))
}

/// Passport expiry (MRZ chars 65..71 for TD3, 38..44 for TD1), as
/// `getExpiryDateRange`.
pub fn expiry_from_mrz(mrz: &str) -> Result<String, String> {
    let range = if mrz.len() == 90 { 38..44 } else { 65..71 };
    mrz.get(range)
        .map(str::to_string)
        .ok_or("MRZ too short for expiry date".into())
}

pub struct InputGenSalts {
    /// DSC circuit salt (must equal the ID-data `salt_in` for a valid chain).
    pub dsc_salt: BigUint,
    /// ID-data `salt_in` (commits to the DSC comm).
    pub id_salt_in: BigUint,
    /// ID-data `salt_out` (becomes the integrity `salt_in` in a valid chain).
    pub id_salt_out: BigUint,
    /// Integrity `salt_in`.
    pub integrity_salt_in: BigUint,
    /// Integrity→disclosure salts (shared with the age circuit).
    pub disclosure: IntegrityToDisclosureSalts,
}

/// `getPublicSalt` (`src/lib/index.ts`): sha256 of the salt's hex bytes.
/// The salt is `toString(16)`'d (no leading zeros); Node's `Buffer.from(hex)`
/// drops a trailing odd nibble, so an odd-length hex string is truncated.
pub fn get_public_salt(salt: &BigUint) -> BigUint {
    let mut hex = format!("{salt:x}");
    if hex.len() % 2 == 1 {
        hex.pop();
    }
    let bytes = if hex.is_empty() {
        Vec::new()
    } else {
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect::<Vec<u8>>()
    };
    BigUint::from_bytes_be(&Sha256::digest(&bytes))
}

impl InputGenSalts {
    /// Build the full salt set from ONE master salt, exactly as the app's
    /// ProofService does: dsc = id_in = id_out = integrity_in = salt, and the
    /// disclosure salts via `getIntegrityToDisclosureSalts` (dg1/nullifier =
    /// salt, dg2Hash/expiryDate = getPublicSalt(salt)).
    pub fn from_master(salt: BigUint) -> Self {
        let public_salt = get_public_salt(&salt);
        InputGenSalts {
            dsc_salt: salt.clone(),
            id_salt_in: salt.clone(),
            id_salt_out: salt.clone(),
            integrity_salt_in: salt.clone(),
            disclosure: IntegrityToDisclosureSalts {
                dg1_salt: salt.clone(),
                private_nullifier_salt: salt,
                dg2_hash_salt: public_salt.clone(),
                expiry_date_salt: public_salt,
            },
        }
    }
}

pub struct GenerateParams<'a> {
    pub sod_der: &'a [u8],
    pub dg1: &'a [u8],
    /// DG2 hash bytes, hashed with the SOD's data-group hash algorithm.
    pub dg2_hash: &'a [u8],
    /// The matched CSCA for this passport's DSC.
    pub csca: &'a PackagedCertificate,
    pub certs_meta: &'a PackagedCertsMeta<'a>,
    pub cert_leaves: &'a [BigUint],
    /// The verifier Query JSON (SDK `c` param) driving disclosure selection.
    pub query: &'a Value,
    pub evm: bool,
    pub nullifier_secret: BigUint,
    /// See [`DisclosureInput::hide_nullifier`].
    pub hide_nullifier: bool,
    pub service_scope: BigUint,
    pub service_subscope: BigUint,
    pub current_date_timestamp: u64,
}

pub fn processed_sod_signature(parsed: &ParsedSod) -> Result<Vec<u8>, String> {
    match &parsed.public_key {
        SodPublicKey::Ecdsa { curve, .. } => {
            let (bits, n_hex) =
                curves::curve_info(curve).ok_or_else(|| format!("unknown curve: {curve}"))?;
            Ok(process_ecdsa_signature(
                &parsed.signer_signature,
                (bits as usize).div_ceil(8),
                &hex_to_biguint(n_hex),
            ))
        }
        SodPublicKey::Rsa { .. } => Ok(parsed.signer_signature.clone()),
    }
}

/// The `pss_salt_len` for the DSC circuit: from the certificate signature
/// algorithm when the CSCA signs with RSA-PSS (TS getDSCCircuitInputs).
fn dsc_pss_salt_len(parsed: &ParsedSod, csca: &PackagedCertificate) -> Result<u32, String> {
    if csca.signature_algorithm.as_deref() != Some("RSA-PSS") {
        return Ok(0);
    }
    if let Some(params) = &parsed.cert_sig_alg_params {
        if let Ok(salt) = crate::sod::pss_salt_length_from_params(params) {
            return Ok(salt);
        }
    }
    // Fallback: hash length of the DSC signature algorithm (default sha256 → 32)
    let name = parsed.cert_sig_alg.to_lowercase();
    for (sha, len) in [
        ("sha1", 20u32),
        ("sha224", 28),
        ("sha256", 32),
        ("sha384", 48),
        ("sha512", 64),
    ] {
        if name.contains(sha) {
            return Ok(len);
        }
    }
    Ok(32)
}

pub fn generate_all_inputs(p: &GenerateParams, salts: &InputGenSalts) -> Result<Value, String> {
    let parsed = parse_sod(p.sod_der)?;
    let sod_sig_processed = processed_sod_signature(&parsed)?;
    let mrz = mrz_from_dg1(p.dg1)?;
    let expiry = expiry_from_mrz(&mrz)?;

    // 1. DSC circuit (CSCA → DSC)
    let dsc_inputs = get_dsc_circuit_inputs(
        &DscInput {
            tbs_certificate: &parsed.tbs_certificate,
            dsc_signature: &parsed.cert_signature,
            pss_salt_len: dsc_pss_salt_len(&parsed, p.csca)?,
        },
        &salts.dsc_salt,
        p.csca,
        p.certs_meta,
        p.cert_leaves,
    )?;

    // 2. ID-data circuit (DSC → SOD)
    let dsc_pubkey = match &parsed.public_key {
        SodPublicKey::Rsa { modulus, exponent } => DscPublicKey::Rsa {
            modulus: modulus.clone(),
            exponent: *exponent,
        },
        SodPublicKey::Ecdsa { public_key, curve } => {
            let (bits, n_hex) =
                curves::curve_info(curve).ok_or_else(|| format!("unknown curve: {curve}"))?;
            DscPublicKey::Ecdsa {
                public_key: public_key.clone(),
                curve_n: hex_to_biguint(n_hex),
                curve_byte_size: (bits as usize).div_ceil(8),
            }
        }
    };
    let id_data_inputs = get_id_data_circuit_inputs(
        &IdDataInput {
            dg1: p.dg1,
            e_content: &parsed.e_content,
            signed_attributes: &parsed.signed_attributes,
            sod_signature: &parsed.signer_signature,
            tbs_certificate: &parsed.tbs_certificate,
            dsc_country: &parsed.dsc_country,
            dsc_pubkey,
            pss_salt_len: parsed.sod_pss_salt_len()?,
        },
        &salts.id_salt_in,
        &salts.id_salt_out,
    );

    // 3. Integrity circuit (SOD → DG hashes)
    let integrity_inputs = get_integrity_check_circuit_inputs(
        &IntegrityInputData {
            dg1: p.dg1,
            e_content: &parsed.e_content,
            signed_attributes: &parsed.signed_attributes,
            sod_signature_processed: &sod_sig_processed,
            dsc_country: &parsed.dsc_country,
        },
        &salts.integrity_salt_in,
        &salts.disclosure,
    );

    // 4. Disclosure circuits — whatever the verifier query asks for.
    let disc_input = DisclosureInput {
        dg1: p.dg1,
        e_content: &parsed.e_content,
        sod_signature_processed: &sod_sig_processed,
        dg2_hash: p.dg2_hash,
        expiry_date: &expiry,
        mrz: &mrz,
        hide_nullifier: p.hide_nullifier,
        private_nullifier: None,
    };
    let mut result = disclosure_outputs(
        p.query,
        &disc_input,
        &salts.disclosure,
        &p.nullifier_secret,
        &p.service_scope,
        &p.service_subscope,
        p.current_date_timestamp,
        p.evm,
    )?;
    result["dsc"] = dsc_inputs;
    result["id_data"] = id_data_inputs;
    result["integrity"] = integrity_inputs;
    Ok(result)
}

/// The disclosure circuits the query asks for, the values they disclose and the QueryResult
/// (single source of truth — the platform sends it verbatim).
#[allow(clippy::too_many_arguments)]
fn disclosure_outputs(
    query: &Value,
    disc_input: &DisclosureInput,
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date_timestamp: u64,
    evm: bool,
) -> Result<Value, String> {
    let dg1_padded = right_pad_with_zeros(disc_input.dg1, DG1_INPUT_SIZE);
    let disclosures = crate::query::build_disclosures(
        query,
        disc_input,
        salts,
        nullifier_secret,
        service_scope,
        service_subscope,
        current_date_timestamp,
        evm,
        &dg1_padded,
    )?;
    let disclosures_json: Vec<Value> = disclosures
        .iter()
        .map(|d| {
            let mut o = json!({ "name": d.name, "inputs": d.inputs, "committedInputs": d.committed_inputs });
            if let Some(disc) = &d.disclosed {
                o["disclosed"] = disc.clone();
            }
            o
        })
        .collect();

    let mut disclosed = json!({});
    for d in &disclosures {
        if let (Some(map), Some(disc)) = (disclosed.as_object_mut(), &d.disclosed) {
            if let Some(dm) = disc.as_object() {
                for (k, v) in dm {
                    map.insert(k.clone(), v.clone());
                }
            }
        }
    }
    let query_result = crate::query::build_query_result(query, &disclosed, current_date_timestamp);

    Ok(json!({
        "disclosures": disclosures_json,
        "disclosed": disclosed,
        "query_result": query_result,
    }))
}

pub struct AadhaarParams<'a> {
    /// The decompressed QR data less its trailing signature.
    pub signed_data: &'a [u8],
    pub signature: &'a [u8],
    pub certificates: &'a [PackagedCertificate],
    pub certs_meta: &'a PackagedCertsMeta<'a>,
    pub cert_leaves: &'a [BigUint],
    pub query: &'a Value,
    pub evm: bool,
    pub nullifier_secret: BigUint,
    pub hide_nullifier: bool,
    pub service_scope: BigUint,
    pub service_subscope: BigUint,
    pub current_date_timestamp: u64,
}

/// As `generate_all_inputs` for an Aadhaar: the `aadhaar_id` base proof's inputs in place of
/// the three chip base proofs', then the disclosure circuits on its commitment.
pub fn generate_aadhaar_inputs(
    p: &AadhaarParams,
    salts: &IntegrityToDisclosureSalts,
) -> Result<Value, String> {
    if !aadhaar::is_nationality_condition_allowed(p.query) {
        return Err("An Aadhaar does not prove a nationality, so it can only pass an exclusion check".into());
    }
    let parsed = aadhaar::parse_aadhaar(p.signed_data)?;
    let certificate = aadhaar::find_uidai_certificate(p.certificates, p.signed_data, p.signature)
        .ok_or("The UIDAI key is not in the Certificate Registry")?;
    let base_inputs = aadhaar::get_aadhaar_circuit_inputs(
        p.signed_data,
        p.signature,
        &parsed,
        certificate,
        p.certs_meta,
        p.cert_leaves,
        salts,
    )?;
    let mrz = parsed.mrz();
    let disc_input = DisclosureInput {
        dg1: &parsed.dg1,
        e_content: &[],
        sod_signature_processed: &[],
        dg2_hash: &parsed.photo_hash,
        expiry_date: &expiry_from_mrz(mrz)?,
        mrz,
        hide_nullifier: p.hide_nullifier,
        private_nullifier: Some(parsed.private_nullifier()),
    };
    let mut result = disclosure_outputs(
        p.query,
        &disc_input,
        salts,
        &p.nullifier_secret,
        &p.service_scope,
        &p.service_subscope,
        p.current_date_timestamp,
        p.evm,
    )?;
    result[aadhaar::AADHAAR_CIRCUIT_NAME] = base_inputs;
    Ok(result)
}
