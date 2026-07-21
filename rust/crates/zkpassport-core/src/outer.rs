//! Outer (compression/aggregation) proof input assembly + cloud-prover request.
//!
//! Ports the pure pieces from `@zkpassport/utils`: `ultraVkToFields`,
//! `proofToFields`/`getProofData`, `getNumberOfPublicInputs`,
//! `getLeavesFromCircuitManifest`/`getCircuitMerkleProof`, and
//! `getOuterCircuitInputs`. The cloud POST itself is IO (platform runner).
//! Used for the compressed / compressed-evm (on-chain-verifiable) modes.

use crate::merkle::compute_merkle_proof;
use crate::plan::CircuitManifest;
use num_bigint::BigUint;
use serde_json::{json, Value};

pub const CIRCUIT_REGISTRY_HEIGHT: usize = 12;

/// `getNumberOfPublicInputs`
pub fn num_public_inputs(name: &str) -> usize {
    if name.starts_with("data_check_integrity")
        || name.starts_with("sig_check_id_data")
        || name.starts_with("sig_check_dsc")
    {
        2
    } else if name.starts_with("oprf_auth") {
        3
    } else if name.starts_with("outer") {
        let n: i64 = name
            .rsplit('_')
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(3);
        (8 + (n - 3)).max(0) as usize
    } else {
        8
    }
}

/// `proofToFields`: 32-byte big-endian chunks, hex (no 0x); the final partial
/// chunk is right-padded with zero bytes (trailing).
pub fn proof_to_fields(proof: &[u8]) -> Vec<String> {
    let mut fields = Vec::new();
    let mut i = 0;
    while i < proof.len() {
        let mut chunk = [0u8; 32];
        let end = (i + 32).min(proof.len());
        chunk[..end - i].copy_from_slice(&proof[i..end]);
        fields.push(hex::encode(chunk));
        i += 32;
    }
    fields
}

pub struct ProofData {
    /// Proof body fields (no 0x prefix), i.e. fields after the public inputs.
    pub proof: Vec<String>,
    /// Public-input fields, 0x-prefixed.
    pub public_inputs: Vec<String>,
}

/// `getProofData(proof, publicInputsNumber)` — first N fields are public inputs.
pub fn get_proof_data(proof_hex: &str, num_pub: usize) -> Result<ProofData, String> {
    let bytes = hex::decode(proof_hex.strip_prefix("0x").unwrap_or(proof_hex))
        .map_err(|e| e.to_string())?;
    let all = proof_to_fields(&bytes);
    if all.len() < num_pub {
        return Err("proof shorter than public input count".into());
    }
    let public_inputs = all[..num_pub].iter().map(|f| format!("0x{f}")).collect();
    let proof = all[num_pub..].to_vec();
    Ok(ProofData {
        proof,
        public_inputs,
    })
}

/// `ultraVkToFields`: base64-decoded vkey → 32-byte chunks, each `0x` + 64 hex
/// LEFT-padded (a full UltraHonk vkey is 112 fields).
pub fn ultra_vk_to_fields(bytes: &[u8]) -> Vec<String> {
    let mut fields = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let end = (i + 32).min(bytes.len());
        let hex = hex::encode(&bytes[i..end]);
        fields.push(format!("0x{:0>64}", hex));
        i += 32;
    }
    fields
}

/// `getLeavesFromCircuitManifest`: circuit vkey-hashes as bigints, ascending.
pub fn circuit_leaves(manifest: &CircuitManifest) -> Vec<BigUint> {
    let mut leaves: Vec<BigUint> = manifest
        .circuits
        .values()
        .map(|c| {
            let h = c.hash.strip_prefix("0x").unwrap_or(&c.hash);
            BigUint::parse_bytes(h.as_bytes(), 16).unwrap_or_default()
        })
        .collect();
    leaves.sort();
    leaves
}

/// `getCircuitMerkleProof`: (treeIndex hex, treeHashPath) for a circuit hash.
pub fn circuit_merkle_proof(
    manifest: &CircuitManifest,
    key_hash: &str,
) -> Result<(String, Vec<String>), String> {
    let leaves = circuit_leaves(manifest);
    let target = {
        let h = key_hash.strip_prefix("0x").unwrap_or(key_hash);
        BigUint::parse_bytes(h.as_bytes(), 16).ok_or("bad key hash")?
    };
    let index = leaves
        .iter()
        .position(|l| *l == target)
        .ok_or("circuit hash not in manifest")?;
    let proof = compute_merkle_proof(&leaves, index, CIRCUIT_REGISTRY_HEIGHT);
    let path = proof["path"]
        .as_array()
        .ok_or("no path")?
        .iter()
        .map(|v| v.as_str().unwrap_or("").to_string())
        .collect();
    Ok((format!("0x{index:x}"), path))
}

/// A subproof packed for the outer circuit (an `OuterCircuitProof`).
pub struct OuterSubproof {
    pub proof: Vec<String>,
    pub public_inputs: Vec<String>,
    pub vkey: Vec<String>,
    pub key_hash: String,
    pub tree_hash_path: Vec<String>,
    pub tree_index: String,
}

impl OuterSubproof {
    fn to_json(&self, public_inputs: &[String]) -> Value {
        json!({
            "vkey": self.vkey,
            "proof": self.proof,
            "public_inputs": public_inputs,
            "key_hash": self.key_hash,
            "tree_hash_path": self.tree_hash_path,
            "tree_index": self.tree_index,
        })
    }
}

/// `getOuterCircuitInputs`. Disclosure PI layout:
/// [0]=comm_in [1]=current_date [2]=scope [3]=subscope [4]=param_commitment
/// [5]=nullifier_type [6]=scoped_nullifier [7]=oprf_pk_hash
pub fn get_outer_circuit_inputs(
    csc_to_dsc: &OuterSubproof,
    dsc_to_id: &OuterSubproof,
    integrity: &OuterSubproof,
    disclosures: &[OuterSubproof],
    circuit_registry_root: &str,
) -> Result<Value, String> {
    let with_nullifier = disclosures
        .iter()
        .find(|p| {
            p.public_inputs
                .get(6)
                .map(|n| {
                    let h = n.strip_prefix("0x").unwrap_or(n);
                    BigUint::parse_bytes(h.as_bytes(), 16)
                        .map(|b| b != BigUint::from(0u8))
                        .unwrap_or(false)
                })
                .unwrap_or(false)
        })
        .ok_or("No disclosure proof with non-zero nullifier found")?;

    let certificate_registry_root = &csc_to_dsc.public_inputs[0];
    let current_date: u64 = {
        let s = with_nullifier.public_inputs[1]
            .strip_prefix("0x")
            .unwrap_or(&with_nullifier.public_inputs[1]);
        BigUint::parse_bytes(s.as_bytes(), 16)
            .and_then(|b| u64::try_from(b).ok())
            .unwrap_or(0)
    };
    let param_commitments: Vec<String> = disclosures
        .iter()
        .map(|p| p.public_inputs[4].clone())
        .collect();

    Ok(json!({
        "certificate_registry_root": certificate_registry_root,
        "circuit_registry_root": circuit_registry_root,
        "current_date": current_date,
        "service_scope": with_nullifier.public_inputs[2],
        "service_subscope": with_nullifier.public_inputs[3],
        "param_commitments": param_commitments,
        "scoped_nullifier": with_nullifier.public_inputs[6],
        "nullifier_type": with_nullifier.public_inputs[5],
        "oprf_pk_hash": with_nullifier.public_inputs[7],
        // csc_to_dsc drops PI[0] (the cert registry root).
        "csc_to_dsc_proof": csc_to_dsc.to_json(&csc_to_dsc.public_inputs[1..].to_vec()),
        "dsc_to_id_data_proof": dsc_to_id.to_json(&dsc_to_id.public_inputs),
        "integrity_check_proof": integrity.to_json(&integrity.public_inputs),
        "disclosure_proofs": disclosures.iter().map(|p| {
            let reordered = vec![
                p.public_inputs[0].clone(), // comm_in
                p.public_inputs[6].clone(), // scoped_nullifier
                p.public_inputs[5].clone(), // nullifier_type
                p.public_inputs[7].clone(), // oprf_pk_hash
            ];
            p.to_json(&reordered)
        }).collect::<Vec<_>>(),
    }))
}

/// `getOuterCircuit` naming: N = disclosure_count + 3, range 4..=13.
pub fn outer_circuit_name(disclosure_count: usize, evm: bool) -> Result<String, String> {
    let n = disclosure_count + 3;
    if !(4..=13).contains(&n) {
        return Err(format!("Unsupported number of subproofs: {n} (expected 4-13)"));
    }
    Ok(format!("outer_{}count_{n}", if evm { "evm_" } else { "" }))
}
