//! C ABI for zkpassport-core.
//!
//! One JSON-in / JSON-out entry point so the Swift/Kotlin side stays trivial:
//!
//! ```c
//! char *zkpassport_generate_inputs(const char *request_json);
//! void  zkpassport_free_string(char *s);
//! ```
//!
//! Request (all byte fields base64, all field elements decimal strings):
//! {
//!   "sod": "<base64 SOD DER (ICAO 77 82 wrapper ok)>",
//!   "dg1": "<base64>",
//!   "dg2_hash": "<base64>",
//!   "csca": { <PackagedCertificate JSON> },
//!   "certs_meta": { "version": 1, "root": "0x..", "timestamp": n,
//!                    "revocations": [...], "masterlists": ["0x..", ...] },
//!   "cert_leaves": ["<dec>", ...],
//!   "age_query": { "gte": 18 },              // gt/gte/lt/lte/range/eq/disclose_age
//!   "service_scope": "verifier.example.com", // hashed via getServiceScopeHash
//!   "service_subscope": "proof-of-age",
//!   "nullifier_secret": "0",
//!   "current_date_timestamp": 1789000000,
//!   "salts": { "dsc": "<dec>", "id_in": "<dec>", "id_out": "<dec>",
//!              "integrity_in": "<dec>", "dg1": "<dec>", "expiry_date": "<dec>",
//!              "dg2_hash": "<dec>", "private_nullifier": "<dec>" }
//! }
//!
//! Response: {"dsc": {...}, "id_data": {...}, "integrity": {...}, "age": {...}}
//! or {"error": "..."}.

pub mod driver;

use base64::Engine;
use num_bigint::BigUint;
use serde::Deserialize;
use std::ffi::{c_char, CStr, CString};
use zkpassport_core::commitments::IntegrityToDisclosureSalts;
use zkpassport_core::dsc::PackagedCertsMeta;
use zkpassport_core::input_gen::{generate_all_inputs, scope_hash, GenerateParams, InputGenSalts};
use zkpassport_core::registry::{PackagedCertificate, Revocation};

#[derive(Deserialize)]
struct CertsMetaJson {
    version: u32,
    root: String,
    timestamp: u64,
    #[serde(default)]
    revocations: Vec<Revocation>,
    #[serde(default)]
    masterlists: Vec<String>,
}


/// Granular salts (test/differential use). Production sends a single `salt`.
#[derive(Deserialize)]
struct SaltsJson {
    dsc: String,
    id_in: String,
    id_out: String,
    integrity_in: String,
    dg1: String,
    expiry_date: String,
    dg2_hash: String,
    private_nullifier: String,
}

#[derive(Deserialize)]
struct Request {
    sod: String,
    dg1: String,
    /// Pre-computed DG2 hash; if absent, `dg2` (raw) is hashed with the
    /// SOD's data-group hash algorithm.
    #[serde(default)]
    dg2_hash: Option<String>,
    #[serde(default)]
    dg2: Option<String>,
    /// Pre-matched CSCA; if absent, `certificates` is AKI/SKI-matched.
    #[serde(default)]
    csca: Option<PackagedCertificate>,
    /// Full packaged certificate list (for CSCA matching and/or leaf computation).
    #[serde(default)]
    certificates: Option<Vec<PackagedCertificate>>,
    certs_meta: CertsMetaJson,
    /// Pre-computed sorted leaf hashes; if absent, computed from `certificates`.
    #[serde(default)]
    cert_leaves: Option<Vec<String>>,
    /// The verifier Query JSON (SDK `c` param) driving disclosure selection.
    #[serde(default)]
    query: serde_json::Value,
    #[serde(default)]
    service_scope: String,
    #[serde(default)]
    service_subscope: String,
    #[serde(default)]
    nullifier_secret: Option<String>,
    current_date_timestamp: u64,
    /// The single master salt (production). All base + disclosure salts derive
    /// from it (see InputGenSalts::from_master). Takes precedence over `salts`.
    #[serde(default)]
    salt: Option<String>,
    /// Granular salts (differential tests only).
    #[serde(default)]
    salts: Option<SaltsJson>,
    /// Use the _evm variants for disclosure circuits.
    #[serde(default)]
    evm: bool,
    /// Circuit manifest (from manifest_url); enables the download plan in the
    /// response (per-circuit url/hash/size + srs_size).
    #[serde(default)]
    manifest: Option<zkpassport_core::plan::CircuitManifest>,
    #[serde(default = "default_chain_id")]
    chain_id: u64,
}

fn default_chain_id() -> u64 {
    1
}

/// Decimal or 0x-hex field element.
fn dec(s: &str) -> Result<BigUint, String> {
    if let Some(hex) = s.strip_prefix("0x") {
        return BigUint::parse_bytes(hex.as_bytes(), 16)
            .ok_or(format!("invalid hex value: {s}"));
    }
    s.parse().map_err(|_| format!("invalid decimal value: {s}"))
}

fn b64(s: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| format!("invalid base64: {e}"))
}

fn run(request_json: &str) -> Result<serde_json::Value, String> {
    let req: Request =
        serde_json::from_str(request_json).map_err(|e| format!("invalid request: {e}"))?;

    let sod_der = b64(&req.sod)?;
    let dg1 = b64(&req.dg1)?;
    let dg2_hash = match (&req.dg2_hash, &req.dg2) {
        (Some(h), _) => b64(h)?,
        (None, Some(raw)) => {
            let parsed = zkpassport_core::sod::parse_sod(&sod_der)?;
            zkpassport_core::input_gen::hash_data_group(&b64(raw)?, &parsed.dg_hash_alg)?
        }
        // No DG2 needed on-chip: the SOD's LDSSecurityObject already carries
        // every data-group hash (the same value the integrity circuit checks).
        (None, None) => {
            let parsed = zkpassport_core::sod::parse_sod(&sod_der)?;
            parsed
                .dg_hashes
                .iter()
                .find(|(n, _)| *n == 2)
                .map(|(_, h)| h.clone())
                .ok_or("SOD has no DG2 hash")?
        }
    };
    let cert_leaves = match &req.cert_leaves {
        Some(leaves) => leaves.iter().map(|s| dec(s)).collect::<Result<Vec<_>, _>>()?,
        None => {
            let certs = req
                .certificates
                .as_ref()
                .ok_or("either cert_leaves or certificates is required")?;
            zkpassport_core::registry::get_certificate_leaf_hashes(certs, req.certs_meta.version)?
        }
    };
    let csca = match &req.csca {
        Some(c) => c.clone(),
        None => {
            let certs = req
                .certificates
                .as_ref()
                .ok_or("either csca or certificates is required")?;
            let parsed = zkpassport_core::sod::parse_sod(&sod_der)?;
            zkpassport_core::registry::match_csca(
                certs,
                &parsed.dsc_country,
                parsed.authority_key_identifier.as_deref(),
            )
            .ok_or("could not match a CSCA for this passport's DSC")?
            .clone()
        }
    };
    let meta = PackagedCertsMeta {
        version: req.certs_meta.version,
        root: &req.certs_meta.root,
        timestamp: req.certs_meta.timestamp,
        revocations: &req.certs_meta.revocations,
        masterlists: &req.certs_meta.masterlists,
    };
    let params = GenerateParams {
        sod_der: &sod_der,
        dg1: &dg1,
        dg2_hash: &dg2_hash,
        csca: &csca,
        certs_meta: &meta,
        cert_leaves: &cert_leaves,
        query: &req.query,
        evm: req.evm,
        nullifier_secret: match &req.nullifier_secret {
            Some(s) => dec(s)?,
            None => BigUint::from(0u8),
        },
        service_scope: scope_hash(&req.service_scope),
        service_subscope: scope_hash(&req.service_subscope),
        current_date_timestamp: req.current_date_timestamp,
    };
    let salts = match (&req.salt, &req.salts) {
        (Some(master), _) => InputGenSalts::from_master(dec(master)?),
        (None, Some(s)) => InputGenSalts {
            dsc_salt: dec(&s.dsc)?,
            id_salt_in: dec(&s.id_in)?,
            id_salt_out: dec(&s.id_out)?,
            integrity_salt_in: dec(&s.integrity_in)?,
            disclosure: IntegrityToDisclosureSalts {
                dg1_salt: dec(&s.dg1)?,
                expiry_date_salt: dec(&s.expiry_date)?,
                dg2_hash_salt: dec(&s.dg2_hash)?,
                private_nullifier_salt: dec(&s.private_nullifier)?,
            },
        },
        (None, None) => return Err("either salt or salts is required".into()),
    };
    let mut result = generate_all_inputs(&params, &salts)?;
    // Circuit names: base three (from the passport) + one per disclosure
    // (query-driven, already named in the result), in proving order.
    let parsed = zkpassport_core::sod::parse_sod(&sod_der)?;
    let names = zkpassport_core::select::get_circuit_names(&parsed, &csca, req.evm)?;
    let mut circuit_names: Vec<String> =
        vec![names.dsc.clone(), names.id_data.clone(), names.integrity.clone()];
    if let Some(discs) = result["disclosures"].as_array() {
        for d in discs {
            if let Some(n) = d["name"].as_str() {
                circuit_names.push(n.to_string());
            }
        }
    }
    let name_refs: Vec<&str> = circuit_names.iter().map(|s| s.as_str()).collect();
    result["base_circuits"] = serde_json::json!({
        "dsc": names.dsc, "id_data": names.id_data, "integrity": names.integrity,
    });
    result["circuits"] = match &req.manifest {
        Some(manifest) => {
            zkpassport_core::plan::plan_for_names(manifest, &name_refs, req.chain_id)?
        }
        None => serde_json::json!({ "list": circuit_names }),
    };
    Ok(result)
}

/// URL helpers so the platform runner never builds URLs itself.
#[no_mangle]
pub extern "C" fn zkpassport_manifest_url(chain_id: u64, version: *const c_char) -> *mut c_char {
    let version = unsafe { CStr::from_ptr(version) }.to_str().unwrap_or("");
    CString::new(zkpassport_core::plan::manifest_url_by_version(chain_id, version))
        .unwrap()
        .into_raw()
}

/// Packaged-certificates URL for a given registry root.
#[no_mangle]
pub extern "C" fn zkpassport_certificates_url(chain_id: u64, root: *const c_char) -> *mut c_char {
    let root = unsafe { CStr::from_ptr(root) }.to_str().unwrap_or("");
    CString::new(zkpassport_core::plan::certificates_url(chain_id, root))
        .unwrap()
        .into_raw()
}

/// Safe Rust entry point (same JSON contract as the C ABI).
pub fn generate_inputs_json(request_json: &str) -> String {
    match run(request_json) {
        Ok(v) => v.to_string(),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    }
}

/// Build the cloud-prover request `inputs` for the outer/compression proof
/// (compressed / compressed-evm modes). Request JSON:
/// {
///   "subproofs": [ {"name","proof"(hex),"vkey"(base64)}, ... ]  // csc, id, integrity, then disclosures
///   "manifest": { … }, "evm": bool
/// }
/// Response: {"circuit_name","circuit_registry_root","inputs"} or {"error"}.
/// The platform runner downloads that outer circuit, POSTs
/// {bb_version,inputs,vkey,circuit_root,circuit_name,recursive,evm,disable_zk,circuit}
/// to cloud-prover.zkpassport.id/prove, and sends the returned single proof.
pub fn build_outer_request_json(request_json: &str) -> String {
    match build_outer_request(request_json) {
        Ok(v) => v.to_string(),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    }
}

#[derive(Deserialize)]
struct OuterSubproofJson {
    name: String,
    proof: String,
    vkey: String,
}

fn build_outer_request(request_json: &str) -> Result<serde_json::Value, String> {
    use zkpassport_core::outer;
    #[derive(Deserialize)]
    struct Req {
        subproofs: Vec<OuterSubproofJson>,
        manifest: zkpassport_core::plan::CircuitManifest,
        #[serde(default)]
        evm: bool,
        #[serde(default = "default_chain_id")]
        chain_id: u64,
    }
    let req: Req = serde_json::from_str(request_json).map_err(|e| e.to_string())?;
    if req.subproofs.len() < 4 {
        return Err("need at least 3 base + 1 disclosure subproof".into());
    }
    let build = |s: &OuterSubproofJson| -> Result<outer::OuterSubproof, String> {
        let key_hash = req
            .manifest
            .circuits
            .get(&s.name)
            .ok_or_else(|| format!("circuit {} not in manifest", s.name))?
            .hash
            .clone();
        let pd = outer::get_proof_data(&s.proof, outer::num_public_inputs(&s.name))?;
        let vkey_bytes = base64::engine::general_purpose::STANDARD
            .decode(&s.vkey)
            .map_err(|e| e.to_string())?;
        let (tree_index, tree_hash_path) = outer::circuit_merkle_proof(&req.manifest, &key_hash)?;
        Ok(outer::OuterSubproof {
            proof: pd.proof,
            public_inputs: pd.public_inputs,
            vkey: outer::ultra_vk_to_fields(&vkey_bytes),
            key_hash,
            tree_hash_path,
            tree_index,
        })
    };
    let subs: Vec<outer::OuterSubproof> =
        req.subproofs.iter().map(build).collect::<Result<_, _>>()?;
    let disclosures = &subs[3..];
    let inputs = outer::get_outer_circuit_inputs(
        &subs[0],
        &subs[1],
        &subs[2],
        disclosures,
        &req.manifest.root,
    )?;
    let circuit_name = outer::outer_circuit_name(disclosures.len(), req.evm)?;
    let entry = req
        .manifest
        .circuits
        .get(&circuit_name)
        .ok_or_else(|| format!("outer circuit {circuit_name} not in manifest"))?;
    Ok(serde_json::json!({
        "circuit_name": circuit_name,
        "circuit_registry_root": req.manifest.root,
        "outer_circuit_hash": entry.hash,
        "outer_circuit_url": zkpassport_core::plan::packaged_circuit_url(req.chain_id, &entry.hash),
        "inputs": inputs,
    }))
}

/// Build the outer cloud-prover request. Free with `zkpassport_free_string`.
///
/// # Safety
/// `request_json` must be a valid NUL-terminated UTF-8 C string.
#[no_mangle]
pub unsafe extern "C" fn zkpassport_build_outer_request(
    request_json: *const c_char,
) -> *mut c_char {
    let s = if request_json.is_null() {
        String::from("{\"error\":\"null request\"}")
    } else {
        match unsafe { CStr::from_ptr(request_json) }.to_str() {
            Ok(s) => build_outer_request_json(s),
            Err(_) => "{\"error\":\"not utf-8\"}".to_string(),
        }
    };
    CString::new(s).unwrap().into_raw()
}

/// Generate all circuit inputs. Returns a heap-allocated JSON string; free it
/// with `zkpassport_free_string`.
///
/// # Safety
/// `request_json` must be a valid NUL-terminated UTF-8 C string.
#[no_mangle]
pub unsafe extern "C" fn zkpassport_generate_inputs(
    request_json: *const c_char,
) -> *mut c_char {
    let result = (|| -> Result<serde_json::Value, String> {
        if request_json.is_null() {
            return Err("null request".into());
        }
        let s = unsafe { CStr::from_ptr(request_json) }
            .to_str()
            .map_err(|_| "request is not valid UTF-8".to_string())?;
        run(s)
    })();
    let json = match result {
        Ok(v) => v.to_string(),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    };
    CString::new(json)
        .unwrap_or_else(|_| CString::new("{\"error\":\"interior NUL\"}").unwrap())
        .into_raw()
}

// ---- Sans-IO session driver C ABI ----------------------------------------
// A platform loop: create → {next → execute command → provide result}* → done.

/// Create a driver session from the config JSON. Returns an opaque handle
/// (free with `zkpassport_session_free`), or null on parse error.
///
/// # Safety
/// `config_json` must be a valid NUL-terminated UTF-8 C string.
#[no_mangle]
pub unsafe extern "C" fn zkpassport_session_create(
    config_json: *const c_char,
) -> *mut driver::Session {
    if config_json.is_null() {
        return std::ptr::null_mut();
    }
    let Ok(s) = (unsafe { CStr::from_ptr(config_json) }).to_str() else {
        return std::ptr::null_mut();
    };
    match driver::Session::new(s) {
        Ok(session) => Box::into_raw(Box::new(session)),
        Err(_) => std::ptr::null_mut(),
    }
}

/// Get the next command as a JSON string (free with `zkpassport_free_string`).
///
/// # Safety
/// `session` must be a live handle from `zkpassport_session_create`.
#[no_mangle]
pub unsafe extern "C" fn zkpassport_session_next(session: *mut driver::Session) -> *mut c_char {
    let session = unsafe { &mut *session };
    CString::new(session.next().to_string()).unwrap().into_raw()
}

/// Feed a command result back. Returns "{}" or {"error":...}.
///
/// # Safety
/// `session`, `id`, `data` must be valid.
#[no_mangle]
pub unsafe extern "C" fn zkpassport_session_provide(
    session: *mut driver::Session,
    id: *const c_char,
    data: *const c_char,
) -> *mut c_char {
    let session = unsafe { &mut *session };
    let id = unsafe { CStr::from_ptr(id) }.to_str().unwrap_or("");
    let data = unsafe { CStr::from_ptr(data) }.to_str().unwrap_or("");
    let r = match session.provide(id, data) {
        Ok(()) => "{}".to_string(),
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    };
    CString::new(r).unwrap().into_raw()
}

/// Free a driver session.
///
/// # Safety
/// `session` must be a handle from `zkpassport_session_create` (or null).
#[no_mangle]
pub unsafe extern "C" fn zkpassport_session_free(session: *mut driver::Session) {
    if !session.is_null() {
        drop(unsafe { Box::from_raw(session) });
    }
}

/// Free a string returned by `zkpassport_generate_inputs`.
///
/// # Safety
/// `s` must be a pointer previously returned by this library (or null).
#[no_mangle]
pub unsafe extern "C" fn zkpassport_free_string(s: *mut c_char) {
    if !s.is_null() {
        drop(unsafe { CString::from_raw(s) });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_path_returns_json_error() {
        let req = CString::new("{not json").unwrap();
        let out = unsafe { zkpassport_generate_inputs(req.as_ptr()) };
        let s = unsafe { CStr::from_ptr(out) }.to_str().unwrap().to_string();
        unsafe { zkpassport_free_string(out) };
        assert!(s.contains("error"), "{s}");
    }
}

// Re-export the bridge C ABI so one static library serves the clip.
pub use zkpassport_bridge::ffi as bridge_ffi;
