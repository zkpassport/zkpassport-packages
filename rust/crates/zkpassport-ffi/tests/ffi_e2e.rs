//! Drives the JSON FFI contract with the real oracle vectors: the request is
//! built exactly as the App Clip will build it. Base three input sets must
//! equal the TS builders, and the query-driven disclosure set must include the
//! requested circuit(s) with matching inputs + committedInputs + download plan.

use base64::Engine;
use serde_json::{json, Value};
use zkpassport_ffi::generate_inputs_json;

fn load_vectors() -> Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../vectors/vectors.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("vectors.json")).unwrap()
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn bytes_of(v: &Value) -> Vec<u8> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_u64().unwrap() as u8)
        .collect()
}

/// Find a produced disclosure circuit by name.
fn disclosure<'a>(out: &'a Value, name: &str) -> &'a Value {
    out["disclosures"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["name"] == name)
        .unwrap_or_else(|| panic!("disclosure {name} not produced"))
}

/// The self-sufficient request the App Clip actually sends: full certificates
/// file, no pre-matched CSCA, no pre-computed leaves, query drives disclosures.
#[test]
fn ffi_query_driven_request_matches_ts() {
    let v = load_vectors();
    let fixtures = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/zkpassport-utils/tests/fixtures/root-certs-v1.json"
    );
    let file: Value = serde_json::from_str(&std::fs::read_to_string(fixtures).unwrap()).unwrap();
    let manifest_path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/zkpassport-utils/tests/fixtures/manifest.json"
    );
    let manifest: Value =
        serde_json::from_str(&std::fs::read_to_string(manifest_path).unwrap()).unwrap();

    let sod_case = &v["sod"].as_array().unwrap()[0]; // john
    let name = sod_case["name"].as_str().unwrap();
    let find = |arr: &str, key: &str| -> Value {
        v[arr]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["name"] == key)
            .unwrap()
            .clone()
    };
    let age_case = find("age", &format!("{name}:gte18"));
    let id_case = find("idData", name);
    let integ_case = find("integrity", name);
    let dsc_case = find("dsc", name);

    let request = json!({
        "sod": sod_case["sod_base64"],
        "dg1": b64(&bytes_of(&id_case["dg1"])),
        "certificates": file["certificates"],
        "certs_meta": {
            "version": v["dscMeta"]["version"], "root": v["dscMeta"]["root"],
            "timestamp": v["dscMeta"]["timestamp"], "revocations": v["dscMeta"]["revocations"],
            "masterlists": v["dscMeta"]["masterlists"],
        },
        "query": { "age": { "gte": 18 } },
        "service_scope": "", "service_subscope": "",
        "current_date_timestamp": age_case["current_date"],
        "manifest": manifest,
        // Granular salts here so the age output matches the age vector exactly.
        "salts": {
            "dsc": dsc_case["salt"], "id_in": id_case["salt_in"], "id_out": id_case["salt_out"],
            "integrity_in": integ_case["salt_in"],
            "dg1": age_case["salts"]["dg1_salt"], "expiry_date": age_case["salts"]["expiry_date_salt"],
            "dg2_hash": age_case["salts"]["dg2_hash_salt"], "private_nullifier": age_case["salts"]["private_nullifier_salt"],
        },
    });

    let out: Value = serde_json::from_str(&generate_inputs_json(&request.to_string())).unwrap();
    assert!(out["error"].is_null(), "{name}: {}", out["error"]);
    assert_eq!(out["dsc"], dsc_case["expected"], "{name}: dsc");
    assert_eq!(out["id_data"], id_case["expected"], "{name}: id_data");
    assert_eq!(out["integrity"], integ_case["expected"], "{name}: integrity");

    // The query asked for age → exactly one disclosure, compare_age, matching
    // the age vector (scopes are empty here).
    let age = disclosure(&out, "compare_age");
    let mut expected_age = age_case["expected"].clone();
    expected_age["service_scope"] = json!("0x0");
    expected_age["service_subscope"] = json!("0x0");
    assert_eq!(age["inputs"], expected_age, "compare_age inputs");
    assert_eq!(age["committedInputs"]["minAge"], 18);

    // Download plan: base three + compare_age, srs sized to cover all.
    let list = out["circuits"]["list"].as_array().unwrap();
    assert_eq!(list.len(), 4, "3 base + 1 disclosure");
    assert_eq!(list[0]["name"], "sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256");
    assert_eq!(list[3]["name"], "compare_age");
    let srs = out["circuits"]["srs_size"].as_u64().unwrap();
    assert!(srs >= 500_000);
    for c in list {
        assert!(srs >= c["size"].as_u64().unwrap());
        let hash = c["hash"].as_str().unwrap();
        assert_eq!(
            c["url"].as_str().unwrap(),
            format!("https://circuits2.zkpassport.id/mainnet/by-hash/{hash}.json")
        );
    }
}

/// A multi-condition query fans out to several disclosure circuits.
#[test]
fn ffi_multi_disclosure_query() {
    let v = load_vectors();
    let fixtures = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/zkpassport-utils/tests/fixtures/root-certs-v1.json"
    );
    let file: Value = serde_json::from_str(&std::fs::read_to_string(fixtures).unwrap()).unwrap();
    let sod_case = &v["sod"].as_array().unwrap()[0];
    let name = sod_case["name"].as_str().unwrap();
    let id_case = v["idData"].as_array().unwrap().iter().find(|c| c["name"] == name).unwrap();

    let request = json!({
        "sod": sod_case["sod_base64"],
        "dg1": b64(&bytes_of(&id_case["dg1"])),
        "certificates": file["certificates"],
        "certs_meta": {
            "version": v["dscMeta"]["version"], "root": v["dscMeta"]["root"],
            "timestamp": v["dscMeta"]["timestamp"], "revocations": v["dscMeta"]["revocations"],
            "masterlists": v["dscMeta"]["masterlists"],
        },
        "query": {
            "age": { "gte": 18 },
            "nationality": { "in": ["ZKR", "FRA"] },
            "firstname": { "disclose": true },
            "issuing_country": { "out": ["AFG"] },
        },
        "service_scope": "verifier.example.com", "service_subscope": "",
        "current_date_timestamp": 1789000000,
        "salt": "12345",
    });
    let out: Value = serde_json::from_str(&generate_inputs_json(&request.to_string())).unwrap();
    assert!(out["error"].is_null(), "error: {}", out["error"]);
    // All four requested disclosure circuits present.
    for n in ["compare_age", "inclusion_check_nationality", "disclose_bytes", "exclusion_check_issuing_country"] {
        let _ = disclosure(&out, n);
    }
    assert_eq!(out["disclosures"].as_array().unwrap().len(), 4);
    // committedInputs shapes.
    assert_eq!(disclosure(&out, "inclusion_check_nationality")["committedInputs"]["countries"], json!(["ZKR", "FRA"]));
    assert_eq!(disclosure(&out, "exclusion_check_issuing_country")["committedInputs"]["countries"], json!(["AFG"]));
}
