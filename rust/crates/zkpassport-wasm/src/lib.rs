//! WASM bindings: the same JSON contract as the C ABI, for browser proving
//! flows (bb.js as the prover). Build with `wasm-pack build` or
//! `cargo build --target wasm32-unknown-unknown`.

use wasm_bindgen::prelude::*;

/// Generate all circuit inputs + the download plan. Same JSON request/response
/// contract as the native `zkpassport_generate_inputs`.
#[wasm_bindgen]
pub fn generate_inputs(request_json: &str) -> String {
    zkpassport_ffi::generate_inputs_json(request_json)
}

#[wasm_bindgen]
pub fn manifest_url(chain_id: u64, version: &str) -> String {
    zkpassport_core::plan::manifest_url_by_version(chain_id, version)
}

#[wasm_bindgen]
pub fn certificates_url(chain_id: u64, root: &str) -> String {
    zkpassport_core::plan::certificates_url(chain_id, root)
}
