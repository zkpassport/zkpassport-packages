//! Fetch/prove plan: the registry URLs and per-circuit download info the
//! platform runner needs. Port of the URL templates in
//! `@zkpassport/registry` `src/constants.ts` and the app's SRS sizing.

use crate::select::CircuitNames;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Minimum SRS size the app always sets up (NoirModule setupCircuit floor).
pub const SRS_SIZE_FLOOR: u64 = 500_000;

fn circuit_base(chain_id: u64) -> &'static str {
    match chain_id {
        1 => "https://circuits2.zkpassport.id/mainnet",
        11155111 => "https://circuits2.zkpassport.id/testnet",
        _ => "http://localhost:8000",
    }
}

/// `PACKAGED_CERTIFICATES_URL_TEMPLATE`
pub fn certificates_url(chain_id: u64, root: &str) -> String {
    let base = match chain_id {
        1 | 8453 => "https://certificates.zkpassport.id/mainnet",
        11155111 => "https://certificates.zkpassport.id/testnet",
        _ => "http://localhost:8000/root",
    };
    format!("{base}/{root}.json")
}

/// `CIRCUIT_MANIFEST_URL_TEMPLATE` (by version)
pub fn manifest_url_by_version(chain_id: u64, version: &str) -> String {
    format!("{}/by-version/{version}/manifest.json", circuit_base(chain_id))
}

/// `PACKAGED_CIRCUIT_URL_TEMPLATE`
pub fn packaged_circuit_url(chain_id: u64, hash: &str) -> String {
    format!("{}/by-hash/{hash}.json", circuit_base(chain_id))
}

#[derive(Deserialize)]
pub struct ManifestEntry {
    pub hash: String,
    pub size: u64,
}

#[derive(Deserialize)]
pub struct CircuitManifest {
    pub version: String,
    pub root: String,
    pub circuits: HashMap<String, ManifestEntry>,
}

/// Per-circuit download info + the single SRS size to set up before proving
/// (bb v5: one SRS per process, sized for the largest circuit).
pub fn plan_circuits(
    manifest: &CircuitManifest,
    names: &CircuitNames,
    chain_id: u64,
) -> Result<Value, String> {
    plan_for_names(
        manifest,
        &[&names.dsc, &names.id_data, &names.integrity, &names.age],
        chain_id,
    )
}

/// Download plan for an arbitrary set of circuit names (base + disclosures):
/// `{ srs_size, list: [{name, hash, size, url}] }`. The `list` order is the
/// caller's order (base circuits first, then disclosures).
pub fn plan_for_names(
    manifest: &CircuitManifest,
    names: &[&str],
    chain_id: u64,
) -> Result<Value, String> {
    let mut srs_size = SRS_SIZE_FLOOR;
    let mut list = Vec::with_capacity(names.len());
    for name in names {
        // Pre-0.5.0 manifests use `data_check_integrity_shaX` for the
        // `..._sa_shaX_dg_shaX` circuits (see parseObsoleteCircuitName).
        let legacy = name
            .strip_prefix("data_check_integrity_sa_")
            .and_then(|rest| {
                let (sa, dg) = rest.split_once("_dg_")?;
                (sa == dg).then(|| format!("data_check_integrity_{sa}"))
            });
        let m = manifest
            .circuits
            .get(*name)
            .or_else(|| legacy.as_ref().and_then(|l| manifest.circuits.get(l)))
            .ok_or_else(|| format!("Circuit {name} not found in manifest"))?;
        srs_size = srs_size.max(m.size);
        list.push(json!({
            "name": name,
            "hash": m.hash,
            "size": m.size,
            "url": packaged_circuit_url(chain_id, &m.hash),
        }));
    }
    Ok(json!({ "srs_size": srs_size, "list": list }))
}
