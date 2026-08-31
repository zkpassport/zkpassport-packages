use crate::constants::{
    NULLIFIER_TYPE_NON_SALTED, NULLIFIER_TYPE_NONE, NULLIFIER_TYPE_SALTED, PROOF_FIELDS, VK_FIELDS,
};
use crate::parse::{parse_public_inputs, PublicInputs};
use bb_proof_verification::verify_honk_proof;
use poseidon::poseidon2::Poseidon2;

pub struct VerifiedOuterProof<let K: u32> {
    pub parsed: PublicInputs<K>,
    pub vk_hash: Field,
}

/// Does NOT check: registry roots, vk acceptance, OPRF binding, or freshness (needs a PrivateContext).
pub fn verify_outer_proof_core<let K: u32>(
    vk: [Field; VK_FIELDS],
    proof: [Field; PROOF_FIELDS],
    public_inputs: [Field; K + 5],
    scope: Field,
    subscope: Field,
    dev_mode: bool,
    expected_commitments: [Field; K - 3],
) -> VerifiedOuterProof<K> {
    // key_hash is recomputed from the vk itself; bb independently asserts key_hash == poseidon2(vk),
    // so passing a self-computed hash is sound — and the registry pins WHICH vks are trusted.
    let vk_hash = Poseidon2::hash(vk, VK_FIELDS);
    verify_honk_proof(vk, proof, public_inputs, vk_hash);

    let parsed = parse_public_inputs::<K>(public_inputs);

    assert(parsed.service_scope == scope, "wrong service scope");
    assert(parsed.service_subscope == subscope, "wrong service subscope");

    let nt = parsed.nullifier_type;
    let is_standard = (nt == NULLIFIER_TYPE_NON_SALTED)
        | (nt == NULLIFIER_TYPE_SALTED)
        | (nt == NULLIFIER_TYPE_NONE);

    assert(is_standard | dev_mode, "nullifier type requires dev mode");

    // NULLIFIER_TYPE_NONE (=4) means the private nullifier was deliberately hidden by the
    // prover -- the canonical circuit forces scoped_nullifier == 0 in that case (see
    // calculate_scoped_nullifier in the circuits repo's commitment libs), so a zero nullifier
    // is only legitimate for NONE and must still be rejected for every other type.
    assert((nt == NULLIFIER_TYPE_NONE) | (parsed.scoped_nullifier != 0), "zero scoped nullifier");

    // Every expected commitment must match a distinct param-commitment slot, in any order. The
    // order is not contractual — the prover decides the subproof (and thus slot) order and the
    // ZKPassport SDK itself matches by membership, so e.g. a {constraint, bind} pair may arrive
    // either way across SDK versions.
    let mut used = [false; K - 3];
    for i in 0..K - 3 {
        let mut found = false;
        for j in 0..K - 3 {
            let hit =
                (!used[j]) & (!found) & (parsed.param_commitments[j] == expected_commitments[i]);
            used[j] = used[j] | hit;
            found = found | hit;
        }
        assert(found, "param commitment mismatch");
    }

    VerifiedOuterProof { parsed, vk_hash }
}

mod test {
    use crate::verify::verify_outer_proof_core;
    // NOTE: nargo test no-ops the recursion opcode — these tests cover parsing/policy/commitment
    // logic only.

    #[test(should_fail_with = "wrong service scope")]
    fn wrong_scope_rejected() {
        let vk = [0; 115];
        let proof = [0; 458];
        let pis = crate::fixtures::FIXTURE_PIS;
        let _ = verify_outer_proof_core::<4>(vk, proof, pis, 0xbad, 0, false, [pis[5]]);
    }

    #[test(should_fail_with = "param commitment mismatch")]
    fn wrong_commitment_rejected() {
        let vk = [0; 115];
        let proof = [0; 458];
        let pis = crate::fixtures::FIXTURE_PIS;
        let _ = verify_outer_proof_core::<4>(vk, proof, pis, 0, 0, false, [0x1234]);
    }

    #[test(should_fail_with = "nullifier type requires dev mode")]
    fn mock_nullifier_needs_dev_mode() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::fixtures::FIXTURE_PIS;
        pis[6] = 2; // NON_SALTED_MOCK
        let _ = verify_outer_proof_core::<4>(vk, proof, pis, 0, 0, false, [pis[5]]);
    }

    // [a, b] must accept a proof carrying [b, a] — the SDK does not fix the subproof (and
    // thus param-commitment) order. Uses K=5 (two commitment slots) like voice's queries.
    #[test]
    fn accepts_swapped_commitments() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = [0; 10];
        for i in 0..8 {
            pis[i] = crate::fixtures::FIXTURE_PIS[i];
        }
        // K=5 layout: [5], [6] are the two param commitments; tail moves to [7..9].
        pis[5] = 0xaaaa;
        pis[6] = 0xbbbb;
        pis[7] = crate::fixtures::FIXTURE_PIS[6]; // nullifier_type
        pis[8] = crate::fixtures::FIXTURE_PIS[7]; // scoped_nullifier
        pis[9] = crate::fixtures::FIXTURE_PIS[8]; // oprf_pk_hash
        let out = verify_outer_proof_core::<5>(vk, proof, pis, 0, 0, false, [0xbbbb, 0xaaaa]);
        assert(out.parsed.param_commitments[0] == 0xaaaa);
        assert(out.parsed.param_commitments[1] == 0xbbbb);
    }

    // A duplicated expectation must not be satisfiable by one slot: [a, a] vs {a, b} fails —
    // each expectation consumes a distinct slot, so coverage is preserved.
    #[test(should_fail_with = "param commitment mismatch")]
    fn rejects_duplicate_expectation_over_single_slot() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = [0; 10];
        for i in 0..8 {
            pis[i] = crate::fixtures::FIXTURE_PIS[i];
        }
        pis[5] = 0xaaaa;
        pis[6] = 0xbbbb;
        pis[7] = crate::fixtures::FIXTURE_PIS[6];
        pis[8] = crate::fixtures::FIXTURE_PIS[7];
        pis[9] = crate::fixtures::FIXTURE_PIS[8];
        let _ = verify_outer_proof_core::<5>(vk, proof, pis, 0, 0, false, [0xaaaa, 0xaaaa]);
    }

    // IMP-1: NULLIFIER_TYPE_NONE (=4) is a privacy-maximising, no-uniqueness mode -- the
    // canonical circuit forces scoped_nullifier == 0 whenever it's used, so it must be exempt
    // from the "zero scoped nullifier" assert (which exists to catch every OTHER type sending a
    // zero nullifier). This must still pass verify_outer_proof_core.
    #[test]
    fn none_nullifier_type_with_zero_nullifier_passes() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::fixtures::FIXTURE_PIS;
        pis[6] = 4; // NULLIFIER_TYPE_NONE
        pis[7] = 0; // scoped_nullifier
        let out = verify_outer_proof_core::<4>(vk, proof, pis, 0, 0, false, [pis[5]]);
        assert(out.parsed.nullifier_type == 4);
        assert(out.parsed.scoped_nullifier == 0);
    }
}
