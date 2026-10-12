//! FFI for the facematch clip flow: build the client_data to App-Attest-sign, and
//! derive the attestation witness fields. JSON-in / JSON-out (like the other FFI fns).
use base64::Engine;
use serde::Deserialize;
use zkpassport_core::facematch::{
    build_facematch_client_data, facematch_attestation_inputs, hash_faceprint_poseidon2,
    pack_and_hash_poseidon2,
};
use zkpassport_core::input_gen::hash_data_group;
use zkpassport_core::sod::parse_sod;

fn hexd(s: &str) -> Result<Vec<u8>, String> {
    hex::decode(s.trim_start_matches("0x")).map_err(|e| e.to_string())
}

fn b64(s: &str) -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD.decode(s).map_err(|e| e.to_string())
}

fn decode_hex_or_b64(s: &str) -> Result<Vec<u8>, String> {
    if let Ok(b) = hex::decode(s.trim_start_matches("0x")) {
        return Ok(b);
    }
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| format!("not hex or base64: {e}"))
}

/// Resolve the raw DG2 hash (the `client_data` digest = the circuit's committed dg2 hash):
/// explicit `dg2_hash` (hex) wins, else from the SOD (hash the DG2 bytes, or read the SOD's
/// DG2 data-group hash). Identical to the circuit-inputs path so the two always agree.
fn resolve_dg2_hash(dg2_hash: &Option<String>, sod: &Option<String>, dg2: &Option<String>) -> Result<Vec<u8>, String> {
    if let Some(h) = dg2_hash {
        return hexd(h);
    }
    let sod = sod.as_ref().ok_or("dg2Hash or sod required")?;
    let parsed = parse_sod(&b64(sod)?)?;
    if let Some(raw) = dg2 {
        return hash_data_group(&b64(raw)?, &parsed.dg_hash_alg);
    }
    parsed
        .dg_hashes
        .iter()
        .find(|(n, _)| *n == 2)
        .map(|(_, h)| h.clone())
        .ok_or_else(|| "SOD has no DG2 hash".into())
}

#[derive(Deserialize)]
struct ClientDataReq {
    #[serde(rename = "appVersion")]
    app_version: String,
    mode: u8,
    #[serde(rename = "dg2Hash")]
    dg2_hash: Option<String>, // hex; or derive from sod/dg2
    sod: Option<String>,      // base64
    dg2: Option<String>,      // base64
    #[serde(rename = "dg2Faceprint")]
    dg2_faceprint: Vec<f32>, // 512
    cosine: i64,
    threshold: Option<i64>,
}

/// Build `client_data` + the poseidon2 hash the clip passes to App Attest `attestKey`.
pub fn facematch_client_data_json(req: &str) -> Result<serde_json::Value, String> {
    let r: ClientDataReq = serde_json::from_str(req).map_err(|e| e.to_string())?;
    let dg2_hash = resolve_dg2_hash(&r.dg2_hash, &r.sod, &r.dg2)?;
    let fp_hash = hash_faceprint_poseidon2(&r.dg2_faceprint)?;
    let client_data =
        build_facematch_client_data(&r.app_version, r.mode, &dg2_hash, &fp_hash, r.cosine, r.threshold)?;
    let cd_hash = pack_and_hash_poseidon2(&client_data);
    Ok(serde_json::json!({
        "clientData": hex::encode(&client_data),
        "clientDataHashB64": base64::engine::general_purpose::STANDARD.encode(&cd_hash),
        "dg2FaceprintHash": hex::encode(&fp_hash),
    }))
}

#[derive(Deserialize)]
struct InputsReq {
    attestation: String, // base64 or hex
    #[serde(rename = "clientData")]
    client_data: String, // hex
}

/// Derive the attestation witness fields from the attestation + client_data.
pub fn facematch_attestation_inputs_json(req: &str) -> Result<serde_json::Value, String> {
    let r: InputsReq = serde_json::from_str(req).map_err(|e| e.to_string())?;
    let att = decode_hex_or_b64(&r.attestation)?;
    let cd = hexd(&r.client_data)?;
    let o = facematch_attestation_inputs(&att, &cd)?;
    Ok(serde_json::json!({
        "root_key": hex::encode(&o.root_key),
        "intermediate_sig": hex::encode(&o.intermediate_sig),
        "intermediate_tbs": hex::encode(&o.intermediate_tbs),
        "intermediate_key": hex::encode(&o.intermediate_key),
        "credential_sig": hex::encode(&o.credential_sig),
        "credential_tbs": hex::encode(&o.credential_tbs),
        "auth_data": hex::encode(&o.auth_data),
        "client_data": hex::encode(&o.client_data),
        "client_data_hash": hex::encode(&o.client_data_hash),
        "environment": o.environment,
        "app_id": o.app_id,
        "facematch_mode": o.facematch_mode,
    }))
}
