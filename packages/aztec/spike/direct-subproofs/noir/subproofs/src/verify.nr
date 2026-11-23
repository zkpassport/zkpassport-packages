use crate::glue::verify_subproofs;
use crate::types::{OUTER_PUBLIC_INPUTS_BASE, OuterPublicInputs, PROOF_SIZE, Subproofs, VKEY_SIZE};
use poseidon::poseidon2::Poseidon2;

global PROOF_TYPE_HONK_ZK: u32 = 6;

global NULLIFIER_TYPE_NON_SALTED: u8 = 0;
global NULLIFIER_TYPE_SALTED: u8 = 1;
global NULLIFIER_TYPE_NON_SALTED_MOCK: u8 = 2;
global NULLIFIER_TYPE_SALTED_MOCK: u8 = 3;
global NULLIFIER_TYPE_NONE: u8 = 4;

pub struct Verified<let N: u32> {
    pub public_inputs: OuterPublicInputs<N>,
    pub nullifier_type: u8,
}

/// Verifies ZKPassport's subproofs directly: the outer circuit's glue, then the checks
/// `zkpassport::verify::verify_outer_proof_core` makes on an outer proof's public inputs.
///
/// Does NOT check registry roots, vk acceptance, OPRF binding or freshness, like
/// `verify_outer_proof_core`. `N` is the number of disclosure proofs.
pub fn verify_zkpassport_subproofs<let N: u32>(
    subproofs: Subproofs<N>,
    domain: Field,
    scope: Field,
    dev_mode: bool,
    expected_commitments: [Field; N],
) -> Verified<N> {
    verify_subproofs(subproofs);
    let public_inputs = subproofs.public_inputs;
    let nullifier_type =
        assert_outer_policy(public_inputs, domain, scope, dev_mode, expected_commitments);
    Verified { public_inputs, nullifier_type }
}

/// The outer-proof path for circuits 0.23.0 (N + 9 public inputs), for paired comparison with
/// `verify_zkpassport_subproofs`: `verify_outer_proof_core` with the verification method appended.
pub fn verify_outer_proof<let N: u32, let L: u32>(
    vk: [Field; VKEY_SIZE],
    proof: [Field; PROOF_SIZE],
    public_inputs: [Field; L],
    domain: Field,
    scope: Field,
    dev_mode: bool,
    expected_commitments: [Field; N],
) -> (Verified<N>, Field) {
    assert(L == N + OUTER_PUBLIC_INPUTS_BASE, "wrong outer public inputs length");
    let vk_hash = Poseidon2::hash(vk, VKEY_SIZE);
    std::verify_proof_with_type(vk, proof, public_inputs, vk_hash, PROOF_TYPE_HONK_ZK);
    let parsed: OuterPublicInputs<N> = OuterPublicInputs::from_fields(public_inputs);
    let nullifier_type =
        assert_outer_policy(parsed, domain, scope, dev_mode, expected_commitments);
    (Verified { public_inputs: parsed, nullifier_type }, vk_hash)
}

// verify_outer_proof_core's checks on the public inputs, the same for both paths.
fn assert_outer_policy<let N: u32>(
    public_inputs: OuterPublicInputs<N>,
    domain: Field,
    scope: Field,
    dev_mode: bool,
    expected_commitments: [Field; N],
) -> u8 {
    assert(public_inputs.service_scope == domain, "wrong service domain");
    assert(public_inputs.service_subscope == scope, "wrong service scope");

    let nt = public_inputs.nullifier_type as u8;
    assert(nt as Field == public_inputs.nullifier_type, "nullifier_type out of range");
    let is_standard = (nt == NULLIFIER_TYPE_NON_SALTED)
        | (nt == NULLIFIER_TYPE_SALTED)
        | (nt == NULLIFIER_TYPE_NONE);
    let is_mock = (nt == NULLIFIER_TYPE_NON_SALTED_MOCK) | (nt == NULLIFIER_TYPE_SALTED_MOCK);
    assert(is_standard | dev_mode, "nullifier type requires dev mode");
    assert(
        (nt == NULLIFIER_TYPE_NONE) | is_mock | (public_inputs.scoped_nullifier != 0),
        "zero scoped nullifier",
    );

    // Each expected commitment matches a distinct slot, in any order.
    let mut used = [false; N];
    for i in 0..N {
        let mut found = false;
        for j in 0..N {
            let hit = (!used[j])
                & (!found)
                & (public_inputs.param_commitments[j] == expected_commitments[i]);
            used[j] = used[j] | hit;
            found = found | hit;
        }
        assert(found, "param commitment mismatch");
    }
    nt
}
