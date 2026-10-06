//! Sans-IO session driver: the ONE place the proving pipeline is sequenced.
//!
//! The platform owns only capabilities (HTTP, prover, websocket); the driver
//! owns every decision (fetch order, circuit set, prove sequence, fast-vs-
//! compressed, the bridge message sequence). It never blocks or calls out — it
//! emits a `Command`, the platform executes it and feeds the result back via
//! `provide`, and `next` advances. Each platform runner becomes a ~40-line
//! loop; adding Android/RN cannot re-introduce orchestration drift.
//!
//! Flow: FetchCerts+FetchManifest → (in-process input gen) → FetchCircuits →
//! Prove× → [BuildOuter → FetchOuter → CloudProve] → BridgeConnect →
//! BridgeSend(accept, proof×, done) → Done.

use serde::Deserialize;
use serde_json::{json, Value};

#[derive(PartialEq)]
enum Phase {
    Start,
    AwaitRegistry,
    FetchCircuits,
    AwaitCircuits,
    Proving,
    AwaitOuter,      // downloading outer circuit
    AwaitCloud,      // cloud POST in flight
    Bridge,
    Done,
    Failed,
}

pub struct Session {
    phase: Phase,
    config: Value,
    mode: String, // "fast" | "compressed" | "compressed-evm"
    // fetched
    certs: Option<String>,
    manifest: Option<Value>,
    // generated
    inputs: Option<Value>,        // full generate_all_inputs result
    circuit_names: Vec<String>,   // proving order
    circuit_inputs: Vec<Value>,   // aligned with circuit_names
    plan: Vec<Value>,             // aligned: {name,hash,size,url}
    circuit_data: Vec<Option<String>>, // downloaded circuit JSON, aligned
    proofs: Vec<Value>,           // {name, proof(hex), committedInputs?}
    proof_vkeys: Vec<String>,     // vkey b64 aligned with proofs (for outer)
    next_prove: usize,
    // outer
    outer_request: Option<Value>, // {circuit_name, circuit_registry_root, outer_circuit_url, inputs}
    outer_circuit: Option<Value>,
    // bridge
    bridge_frames: Vec<String>,
    next_frame: usize,
    error: Option<String>,
}

/// The verifier's session public key etc. + everything generate_all_inputs
/// needs, minus the certs/manifest the driver fetches itself.
#[derive(Deserialize)]
struct Config {
    #[serde(default = "fast")]
    mode: String,
    chain_id: u64,
    circuit_version: String,
    certificates_root: String,
    // opaque: forwarded into the input-gen request
    #[serde(flatten)]
    rest: std::collections::BTreeMap<String, Value>,
}
fn fast() -> String {
    "fast".into()
}

impl Session {
    pub fn new(config_json: &str) -> Result<Self, String> {
        let cfg: Value = serde_json::from_str(config_json).map_err(|e| e.to_string())?;
        let mode = cfg
            .get("mode")
            .and_then(|m| m.as_str())
            .unwrap_or("fast")
            .to_string();
        Ok(Session {
            phase: Phase::Start,
            config: cfg,
            mode,
            certs: None,
            manifest: None,
            inputs: None,
            circuit_names: vec![],
            circuit_inputs: vec![],
            plan: vec![],
            circuit_data: vec![],
            proofs: vec![],
            proof_vkeys: vec![],
            next_prove: 0,
            outer_request: None,
            outer_circuit: None,
            bridge_frames: vec![],
            next_frame: 0,
            error: None,
        })
    }

    fn chain_id(&self) -> u64 {
        self.config.get("chain_id").and_then(|v| v.as_u64()).unwrap_or(1)
    }

    /// The next command as JSON: {"action": "...", ...}.
    pub fn next(&mut self) -> Value {
        match self.phase {
            Phase::Start => {
                self.phase = Phase::AwaitRegistry;
                let chain = self.chain_id();
                let ver = self.config.get("circuit_version").and_then(|v| v.as_str()).unwrap_or("");
                let root = self.config.get("certificates_root").and_then(|v| v.as_str()).unwrap_or("");
                json!({ "action": "fetch", "requests": [
                    { "id": "certs", "url": zkpassport_core::plan::certificates_url(chain, root) },
                    { "id": "manifest", "url": zkpassport_core::plan::manifest_url_by_version(chain, ver) },
                ]})
            }
            Phase::FetchCircuits => {
                self.phase = Phase::AwaitCircuits;
                let requests: Vec<Value> = self
                    .plan
                    .iter()
                    .enumerate()
                    .map(|(i, p)| json!({ "id": i.to_string(), "url": p["url"] }))
                    .collect();
                json!({ "action": "fetch", "requests": requests })
            }
            Phase::AwaitCircuits => {
                // circuits still downloading; platform drives provide().
                json!({ "action": "await" })
            }
            Phase::Proving => {
                if self.next_prove < self.circuit_names.len() {
                    let i = self.next_prove;
                    let circuit = self.circuit_data[i].clone().unwrap_or_default();
                    json!({
                        "action": "prove",
                        "id": i,
                        "name": self.circuit_names[i],
                        "size": self.plan[i]["size"],
                        "circuit": circuit,                 // packaged circuit JSON
                        "inputs": self.circuit_inputs[i],
                        "srs_size": self.inputs.as_ref().unwrap()["circuits"]["srs_size"],
                    })
                } else {
                    self.after_proving()
                }
            }
            Phase::Bridge => {
                if self.next_frame < self.bridge_frames.len() {
                    let f = self.bridge_frames[self.next_frame].clone();
                    self.next_frame += 1;
                    json!({ "action": "bridge_send", "frame": f })
                } else {
                    self.phase = Phase::Done;
                    json!({ "action": "done", "query_result": self.inputs.as_ref()
                        .and_then(|i| i.get("query_result")).cloned().unwrap_or(json!({})) })
                }
            }
            Phase::Done => json!({ "action": "done" }),
            Phase::Failed => json!({ "action": "error", "message": self.error.clone().unwrap_or_default() }),
            _ => json!({ "action": "await" }),
        }
    }

    /// Decide what happens once all subproofs exist: fast → build bridge frames;
    /// compressed → build the outer request and fetch the outer circuit.
    fn after_proving(&mut self) -> Value {
        if self.mode == "fast" {
            self.build_bridge_frames_fast();
            self.phase = Phase::Bridge;
            self.next()
        } else {
            match self.build_outer_request() {
                Ok(req) => {
                    self.outer_request = Some(req.clone());
                    self.phase = Phase::AwaitOuter;
                    json!({ "action": "fetch", "requests": [
                        { "id": "outer", "url": req["outer_circuit_url"] }
                    ]})
                }
                Err(e) => self.fail(e),
            }
        }
    }

    fn fail(&mut self, msg: String) -> Value {
        self.error = Some(msg.clone());
        self.phase = Phase::Failed;
        json!({ "action": "error", "message": msg })
    }

    /// Feed a command result back. `id` matches the command; `data` is the
    /// fetched bytes / proof hex / cloud response depending on phase.
    pub fn provide(&mut self, id: &str, data: &str) -> Result<(), String> {
        match self.phase {
            Phase::AwaitRegistry => {
                match id {
                    "certs" => self.certs = Some(data.to_string()),
                    "manifest" => {
                        self.manifest =
                            Some(serde_json::from_str(data).map_err(|e| e.to_string())?)
                    }
                    _ => {}
                }
                if self.certs.is_some() && self.manifest.is_some() {
                    self.generate_inputs()?;
                }
                Ok(())
            }
            Phase::AwaitCircuits => {
                let i: usize = id.parse().map_err(|_| "bad circuit id")?;
                if i < self.circuit_data.len() {
                    self.circuit_data[i] = Some(data.to_string());
                }
                if self.circuit_data.iter().all(|c| c.is_some()) {
                    self.phase = Phase::Proving;
                }
                Ok(())
            }
            Phase::Proving => {
                // data = proof hex (public_inputs‖proof, prefix already stripped)
                let i: usize = id.parse().map_err(|_| "bad prove id")?;
                let name = self.circuit_names[i].clone();
                let committed = self.committed_for(i);
                let mut entry = json!({ "name": name, "proof": data });
                if let Some(c) = committed {
                    entry["committedInputs"] = c;
                }
                self.proofs.push(entry);
                self.next_prove += 1;
                Ok(())
            }
            Phase::AwaitOuter => {
                self.outer_circuit = Some(serde_json::from_str(data).map_err(|e| e.to_string())?);
                self.phase = Phase::AwaitCloud;
                Ok(())
            }
            Phase::AwaitCloud => {
                // data = cloud response {proof, public_inputs}
                self.build_bridge_frames_outer(data)?;
                self.phase = Phase::Bridge;
                Ok(())
            }
            _ => Ok(()),
        }
    }

    fn generate_inputs(&mut self) -> Result<(), String> {
        // Build the input-gen request: config `rest` + fetched certs + manifest.
        let mut req = self.config.clone();
        let obj = req.as_object_mut().ok_or("bad config")?;
        // certs file is JSON text
        let certs: Value =
            serde_json::from_str(self.certs.as_ref().unwrap()).map_err(|e| e.to_string())?;
        obj.insert("certificates".into(), certs["certificates"].clone());
        obj.insert(
            "certs_meta".into(),
            json!({
                "version": certs["version"], "root": certs["root"], "timestamp": certs["timestamp"],
                "revocations": certs.get("revocations").cloned().unwrap_or(json!([])),
                "masterlists": certs.get("masterlists").cloned().unwrap_or(json!([])),
            }),
        );
        obj.insert("manifest".into(), self.manifest.clone().unwrap());
        obj.insert("evm".into(), json!(self.mode == "compressed-evm"));
        let out = super::run(&req.to_string())?;
        // Extract proving order + inputs + plan.
        let base = &out["base_circuits"];
        self.circuit_names = vec![
            base["dsc"].as_str().unwrap_or("").to_string(),
            base["id_data"].as_str().unwrap_or("").to_string(),
            base["integrity"].as_str().unwrap_or("").to_string(),
        ];
        self.circuit_inputs = vec![
            out["dsc"].clone(),
            out["id_data"].clone(),
            out["integrity"].clone(),
        ];
        if let Some(discs) = out["disclosures"].as_array() {
            for d in discs {
                self.circuit_names.push(d["name"].as_str().unwrap_or("").to_string());
                self.circuit_inputs.push(d["inputs"].clone());
            }
        }
        self.plan = out["circuits"]["list"].as_array().cloned().unwrap_or_default();
        self.circuit_data = vec![None; self.circuit_names.len()];
        self.inputs = Some(out);
        self.phase = Phase::FetchCircuits;
        Ok(())
    }

    /// committedInputs for proof i (base = none; disclosures keyed by name).
    fn committed_for(&self, i: usize) -> Option<Value> {
        let discs = self.inputs.as_ref()?["disclosures"].as_array()?;
        let name = &self.circuit_names[i];
        for d in discs {
            if d["name"].as_str() == Some(name.as_str()) {
                let mut m = serde_json::Map::new();
                m.insert(name.clone(), d["committedInputs"].clone());
                return Some(Value::Object(m));
            }
        }
        None
    }

    fn build_outer_request(&mut self) -> Result<Value, String> {
        let subproofs: Vec<Value> = self
            .proofs
            .iter()
            .enumerate()
            .map(|(i, p)| {
                json!({
                    "name": p["name"], "proof": p["proof"],
                    "vkey": self.circuit_vkey(i),
                })
            })
            .collect();
        let req = json!({
            "subproofs": subproofs,
            "manifest": self.manifest,
            "evm": self.mode == "compressed-evm",
            "chain_id": self.chain_id(),
        });
        super::build_outer_request(&req.to_string())
    }

    fn circuit_vkey(&self, i: usize) -> String {
        self.circuit_data
            .get(i)
            .and_then(|c| c.as_ref())
            .and_then(|s| serde_json::from_str::<Value>(s).ok())
            .and_then(|v| v["vkey"].as_str().map(String::from))
            .unwrap_or_default()
    }

    // --- bridge frame construction (fast: N subproofs; compressed: 1 outer) --

    fn bridge_secret_and_pub(&self) -> Result<(String, String), String> {
        let vp = self.config.get("verifier_pubkey").and_then(|v| v.as_str())
            .ok_or("missing verifier_pubkey")?;
        Ok((vp.to_string(), self.config.get("secret").and_then(|v| v.as_str()).unwrap_or("").to_string()))
    }

    fn build_bridge_frames_fast(&mut self) {
        // Delegated to the platform in the current clip; the driver produces
        // the ORDERED application messages, and the platform's bridge client
        // encrypts+chunks+sends them. Here we emit the plaintext messages.
        let total = self.proofs.len();
        let mut frames = vec![json!({ "method": "accept", "params": {} }).to_string()];
        for (i, p) in self.proofs.iter().enumerate() {
            let mut params = json!({
                "proof": p["proof"], "name": p["name"],
                "index": i, "total": total,
            });
            if let Some(c) = p.get("committedInputs") {
                params["committedInputs"] = c.clone();
            }
            frames.push(json!({ "method": "proof", "params": params }).to_string());
        }
        let qr = self.inputs.as_ref().and_then(|i| i.get("query_result")).cloned().unwrap_or(json!({}));
        frames.push(json!({ "method": "done", "params": qr }).to_string());
        self.bridge_frames = frames;
    }

    fn build_bridge_frames_outer(&mut self, cloud_resp: &str) -> Result<(), String> {
        let resp: Value = serde_json::from_str(cloud_resp).map_err(|e| e.to_string())?;
        let proof = format!(
            "{}{}",
            resp["public_inputs"].as_str().unwrap_or(""),
            resp["proof"].as_str().unwrap_or("")
        );
        // merge all disclosure committedInputs
        let mut merged = serde_json::Map::new();
        for p in &self.proofs {
            if let Some(c) = p.get("committedInputs").and_then(|c| c.as_object()) {
                for (k, v) in c {
                    merged.insert(k.clone(), v.clone());
                }
            }
        }
        let name = self.outer_request.as_ref().unwrap()["circuit_name"].clone();
        let qr = self.inputs.as_ref().and_then(|i| i.get("query_result")).cloned().unwrap_or(json!({}));
        self.bridge_frames = vec![
            json!({ "method": "accept", "params": {} }).to_string(),
            json!({ "method": "proof", "params": {
                "proof": proof, "name": name, "index": 0, "total": 1,
                "committedInputs": Value::Object(merged),
            }}).to_string(),
            json!({ "method": "done", "params": qr }).to_string(),
        ];
        let _ = self.bridge_secret_and_pub(); // validated by platform
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Drives the whole fast-mode pipeline with mock IO (fixtures for certs +
    // manifest + SOD; dummy proofs), asserting the command sequence.
    #[test]
    fn fast_pipeline_sequence() {
        let root = env!("CARGO_MANIFEST_DIR");
        let certs = std::fs::read_to_string(format!(
            "{root}/../../../packages/zkpassport-utils/tests/fixtures/root-certs-v1.json"
        ))
        .unwrap();
        let manifest = std::fs::read_to_string(format!(
            "{root}/../../../packages/zkpassport-utils/tests/fixtures/manifest.json"
        ))
        .unwrap();
        let sod_json: Value = serde_json::from_str(
            &std::fs::read_to_string(format!(
                "{root}/../../../packages/zkpassport-utils/tests/fixtures/john-miller-smith-rsa-2048-sha256.json"
            ))
            .unwrap(),
        )
        .unwrap();
        // Minimal config: the input-gen fields + driver fields.
        let sod_b64 = sod_json["encoded"].as_str().unwrap();
        // dg1 from the john fixture MRZ (recreate as the app does)
        let dg1_b64 = {
            use base64::Engine;
            // 615B5F1F58 + MRZ (from fixtures/passports.ts john)
            let mrz = "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<";
            let mut bytes = hex::decode("615B5F1F58").unwrap();
            bytes.extend_from_slice(mrz.as_bytes());
            base64::engine::general_purpose::STANDARD.encode(bytes)
        };
        let config = json!({
            "mode": "fast", "chain_id": 1, "circuit_version": "0.20.0",
            "certificates_root": "0xroot",
            "sod": sod_b64, "dg1": dg1_b64,
            "query": { "age": { "gte": 18 } },
            "service_scope": "", "service_subscope": "",
            "current_date_timestamp": 1789000000, "salt": "12345",
            "verifier_pubkey": "0256b328b30c8bf5839e24058747879408bdb36241dc9c2e7c619faa12b2920967",
            "secret": "0707070707070707070707070707070707070707070707070707070707070707",
        });
        let mut s = Session::new(&config.to_string()).unwrap();

        // 1. fetch certs+manifest
        let c = s.next();
        assert_eq!(c["action"], "fetch");
        s.provide("certs", &certs).unwrap();
        s.provide("manifest", &manifest).unwrap();

        // 2. after inputs → fetch circuits (base3 + compare_age = 4)
        let c = s.next();
        assert_eq!(c["action"], "fetch", "should fetch circuits");
        assert_eq!(c["requests"].as_array().unwrap().len(), 4);
        for i in 0..4 {
            s.provide(&i.to_string(), "{\"vkey\":\"\",\"bytecode\":\"\"}").unwrap();
        }

        // 3. prove each in order
        let names = ["sig_check_dsc", "sig_check_id_data", "data_check_integrity", "compare_age"];
        for expect in names {
            let c = s.next();
            assert_eq!(c["action"], "prove");
            assert!(c["name"].as_str().unwrap().starts_with(expect), "got {}", c["name"]);
            let id = c["id"].as_u64().unwrap().to_string();
            s.provide(&id, "aabbccdd").unwrap();
        }

        // 4. bridge frames: accept, 4× proof, done
        let mut methods = vec![];
        loop {
            let c = s.next();
            if c["action"] == "done" {
                assert!(c["query_result"]["age"].is_object());
                break;
            }
            assert_eq!(c["action"], "bridge_send");
            let frame: Value = serde_json::from_str(c["frame"].as_str().unwrap()).unwrap();
            methods.push(frame["method"].as_str().unwrap().to_string());
        }
        assert_eq!(methods, ["accept", "proof", "proof", "proof", "proof", "done"]);
    }
}
