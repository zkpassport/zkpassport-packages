//! Fetch/prove plan: the registry URLs and per-circuit download info the
//! platform runner needs. Port of the URL templates in
//! `@zkpassport/registry` `src/constants.ts` and the app's SRS sizing.

use crate::aztec_registry::{AZTEC_CHAIN_ID, AZTEC_TESTNET_CHAIN_ID};
use crate::select::CircuitNames;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Minimum SRS size the app always sets up (NoirModule setupCircuit floor).
pub const SRS_SIZE_FLOOR: u64 = 500_000;

/// The network type of a chain in `networks.ts` of `@zkpassport/registry`, which picks the
/// CDN folder its files are served from.
enum NetworkType {
    Mainnet,
    Testnet,
    Dev,
}

impl NetworkType {
    fn of_chain(chain_id: u64) -> Self {
        match chain_id {
            1 | 8453 | AZTEC_CHAIN_ID => Self::Mainnet,
            11155111 | AZTEC_TESTNET_CHAIN_ID => Self::Testnet,
            _ => Self::Dev,
        }
    }
}

fn circuit_base(chain_id: u64) -> &'static str {
    match NetworkType::of_chain(chain_id) {
        NetworkType::Mainnet => "https://circuits2.zkpassport.id/mainnet",
        NetworkType::Testnet => "https://circuits2.zkpassport.id/testnet",
        NetworkType::Dev => "http://localhost:8000",
    }
}

/// `PACKAGED_CERTIFICATES_URL_TEMPLATE`
pub fn certificates_url(chain_id: u64, root: &str) -> String {
    let base = match NetworkType::of_chain(chain_id) {
        NetworkType::Mainnet => "https://certificates.zkpassport.id/mainnet",
        NetworkType::Testnet => "https://certificates.zkpassport.id/testnet",
        NetworkType::Dev => "http://localhost:8000/root",
    };
    format!("{base}/{root}.json")
}

/// `SANCTIONS_TREE_URL_TEMPLATE`: the serialised sanctions tree of a sanctions root.
pub fn sanctions_tree_url(chain_id: u64, root: &str) -> String {
    let base = match NetworkType::of_chain(chain_id) {
        NetworkType::Mainnet => "https://sanctions.zkpassport.id/mainnet",
        NetworkType::Testnet => "https://sanctions.zkpassport.id/testnet",
        NetworkType::Dev => "http://localhost:8000/sanctions",
    };
    let root = root.strip_prefix("0x").unwrap_or(root).to_lowercase();
    format!("{base}/0x{root:0>64}.tree.json.gz")
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

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = "0x0d839b2da9dec05643a463376da92a2a2d10f0f8610cdd2e0b74d84fa5208b68";

    #[test]
    fn an_aztec_network_shares_the_files_of_its_ethereum_network() {
        for (aztec, ethereum) in [(AZTEC_CHAIN_ID, 1), (AZTEC_TESTNET_CHAIN_ID, 11155111)] {
            assert_eq!(certificates_url(aztec, ROOT), certificates_url(ethereum, ROOT));
            assert_eq!(
                manifest_url_by_version(aztec, "0.23.0"),
                manifest_url_by_version(ethereum, "0.23.0")
            );
            assert_eq!(packaged_circuit_url(aztec, ROOT), packaged_circuit_url(ethereum, ROOT));
            assert_eq!(sanctions_tree_url(aztec, ROOT), sanctions_tree_url(ethereum, ROOT));
        }
        assert!(certificates_url(AZTEC_CHAIN_ID, ROOT).contains("/mainnet/"));
        assert!(certificates_url(AZTEC_TESTNET_CHAIN_ID, ROOT).contains("/testnet/"));
    }

    #[test]
    fn sanctions_tree_url_names_the_root_as_32_lowercase_bytes() {
        let tree = format!("https://sanctions.zkpassport.id/mainnet/0x00{}.tree.json.gz", "ab".repeat(31));

        assert_eq!(sanctions_tree_url(1, &format!("0x{}", "AB".repeat(31))), tree);
        assert_eq!(sanctions_tree_url(1, &"ab".repeat(31)), tree);
        assert!(sanctions_tree_url(11155111, ROOT).starts_with("https://sanctions.zkpassport.id/testnet/"));
        assert!(sanctions_tree_url(31337, ROOT).starts_with("http://localhost:8000/sanctions/"));
    }
}
