//! Circuit selection: which packaged circuit each proof needs for a given
//! passport. Port of the name-derivation logic in the mobile app's
//! `src/lib/circuit-matcher.ts` (`getDSCCircuit`, `getIDDataCircuit` primary
//! path, `getIntegrityCheckCircuit`, `getAgeCircuit`).
//!
//! The app's brute-force signature-detection fallback (used when the declared
//! algorithm fails off-circuit verification) is not ported yet — this is the
//! primary detected-algorithm path.

use crate::id_data::get_tbs_max_len;
use crate::registry::{hex_to_biguint, PackagedCertificate, PublicKey};
use crate::sod::{pss_hash_algorithm_from_params, ParsedSod, SodPublicKey};

pub struct CircuitNames {
    pub dsc: String,
    pub id_data: String,
    pub integrity: String,
    pub age: String,
}

/// "P-256" → ("nist", "p256"); "brainpoolP256r1" → ("brainpool", "256r1")
fn curve_family_and_name(curve: &str) -> (&'static str, String) {
    let family = if curve.contains("brainpool") {
        "brainpool"
    } else {
        "nist"
    };
    let name = curve
        .replace("brainpoolP", "")
        .replace("nist", "")
        .replace("-", "")
        .to_lowercase();
    (family, name)
}

/// sha name ("sha1".."sha512") embedded in an algorithm name, if any.
fn sha_in_name(name: &str) -> Option<&'static str> {
    let lower = name.to_lowercase();
    // Longest match first: "sha1" is a substring of nothing here, but sha224
    // etc. must be checked before sha1-style fallthrough ordering in TS.
    for sha in ["sha1", "sha224", "sha256", "sha384", "sha512"] {
        if lower.contains(sha) {
            return Some(match sha {
                "sha1" => "sha1",
                "sha224" => "sha224",
                "sha256" => "sha256",
                "sha384" => "sha384",
                "sha512" => "sha512",
                _ => unreachable!(),
            });
        }
    }
    None
}

/// `getCSCSignatureHashAlgorithm` (result already lowercased, "sha256" style).
fn csc_signature_hash_algorithm(parsed: &ParsedSod) -> String {
    const DEFAULT: &str = "sha256";
    let name = &parsed.cert_sig_alg;
    if name.is_empty() {
        return DEFAULT.into();
    }
    if name.to_lowercase().contains("pss") {
        if let Some(params) = &parsed.cert_sig_alg_params {
            if let Ok(hash) = pss_hash_algorithm_from_params(params) {
                // TS: "SHA-256" → "sha256"
                return hash.to_lowercase().replace("-", "");
            }
        }
        return DEFAULT.into();
    }
    sha_in_name(name).unwrap_or(DEFAULT).to_string()
}

/// `getSodSignatureAlgorithmHashAlgorithm`
fn sod_signature_hash_algorithm(parsed: &ParsedSod) -> String {
    sha_in_name(&parsed.signer_sig_alg)
        .map(str::to_string)
        .unwrap_or_else(|| parsed.signer_digest_alg.to_lowercase().replace("-", ""))
}

/// `getDSCCircuit` name derivation (CSCA → DSC signature check).
pub fn dsc_circuit_name(
    parsed: &ParsedSod,
    csca: &PackagedCertificate,
) -> Result<String, String> {
    let hash = csc_signature_hash_algorithm(parsed);
    let tbs_max_len = get_tbs_max_len(parsed.tbs_certificate.len());
    let sig_alg = csca
        .signature_algorithm
        .as_deref()
        .unwrap_or("")
        .to_lowercase();
    if sig_alg.contains("ecdsa") {
        let PublicKey::Ec { curve, .. } = &csca.public_key else {
            return Err("ECDSA CSCA without EC public key".into());
        };
        let (family, name) = curve_family_and_name(curve);
        Ok(format!(
            "sig_check_dsc_tbs_{tbs_max_len}_ecdsa_{family}_{name}_{hash}"
        ))
    } else if sig_alg.contains("rsa") {
        let PublicKey::Rsa { modulus, .. } = &csca.public_key else {
            return Err("RSA CSCA without RSA public key".into());
        };
        let modulus_bits = hex_to_biguint(modulus).bits();
        let scheme = if csca.signature_algorithm.as_deref() == Some("RSA-PSS") {
            "pss"
        } else {
            "pkcs"
        };
        Ok(format!(
            "sig_check_dsc_tbs_{tbs_max_len}_rsa_{scheme}_{modulus_bits}_{hash}"
        ))
    } else {
        Err(format!("Unsupported CSCA signature algorithm: {sig_alg}"))
    }
}

/// `getIDDataCircuit` name derivation, primary detected-algorithm path
/// (`buildCircuitNameFromDetectedAlgorithm`).
pub fn id_data_circuit_name(parsed: &ParsedSod) -> Result<String, String> {
    let tbs_max_len = get_tbs_max_len(parsed.tbs_certificate.len());
    match (&parsed.public_key, parsed.signature_type()) {
        (SodPublicKey::Ecdsa { curve, .. }, "ECDSA") => {
            let (family, name) = curve_family_and_name(curve);
            let hash = sod_signature_hash_algorithm(parsed);
            Ok(format!(
                "sig_check_id_data_tbs_{tbs_max_len}_ecdsa_{family}_{name}_{hash}"
            ))
        }
        (SodPublicKey::Rsa { modulus, .. }, "RSA") => {
            let modulus_bits = num_bigint::BigUint::from_bytes_be(modulus).bits();
            let is_pss = parsed.signer_sig_alg.to_lowercase().contains("pss");
            let scheme = if is_pss { "pss" } else { "pkcs" };
            let hash = if is_pss {
                let params = parsed
                    .signer_sig_alg_params
                    .as_ref()
                    .ok_or("RSA-PSS SOD signature without parameters")?;
                pss_hash_algorithm_from_params(params)?
                    .to_lowercase()
                    .replace("-", "")
            } else {
                sod_signature_hash_algorithm(parsed)
            };
            Ok(format!(
                "sig_check_id_data_tbs_{tbs_max_len}_rsa_{scheme}_{modulus_bits}_{hash}"
            ))
        }
        (_, other) => Err(format!("Unsupported SOD signature algorithm: {other}")),
    }
}

/// `getIntegrityCheckCircuit` name derivation.
pub fn integrity_circuit_name(parsed: &ParsedSod) -> String {
    let sa = parsed.signer_digest_alg.to_lowercase().replace("-", "");
    let dg = parsed.dg_hash_alg.to_lowercase().replace("-", "");
    format!("data_check_integrity_sa_{sa}_dg_{dg}")
}

/// All four circuit names for the base + age PoC.
pub fn get_circuit_names(
    parsed: &ParsedSod,
    csca: &PackagedCertificate,
    evm: bool,
) -> Result<CircuitNames, String> {
    Ok(CircuitNames {
        dsc: dsc_circuit_name(parsed, csca)?,
        id_data: id_data_circuit_name(parsed)?,
        integrity: integrity_circuit_name(parsed),
        age: if evm { "compare_age_evm" } else { "compare_age" }.to_string(),
    })
}
