use crate::constants::{
    NULLIFIER_TYPE_NON_SALTED, NULLIFIER_TYPE_NON_SALTED_MOCK, NULLIFIER_TYPE_NONE,
    NULLIFIER_TYPE_SALTED, NULLIFIER_TYPE_SALTED_MOCK, PROOF_FIELDS,
    VERIFICATION_TIER_DEVICE_ATTESTED, VERIFICATION_TIER_GOVERNMENT_SIGNED, VK_FIELDS,
};
use crate::parse::{parse_public_inputs, PublicInputs};
use bb_proof_verification::verify_honk_proof;
use poseidon::poseidon2::Poseidon2;

pub struct VerifiedOuterProof<let P: u32> {
    pub parsed: PublicInputs<P>,
    pub vk_hash: Field,
}

/// Verifies a circuits 0.23.x outer proof with `P` param commitments (P + 9 public inputs).
///
/// Does NOT check: the verification method, the circuits version, registry roots, vk acceptance,
/// OPRF binding, or freshness (needs a PrivateContext).
pub fn verify_outer_proof_core<let P: u32>(
    vk: [Field; VK_FIELDS],
    proof: [Field; PROOF_FIELDS],
    public_inputs: [Field; P + 9],
    domain: Field,
    scope: Field,
    dev_mode: bool,
    expected_commitments: [Field; P],
) -> VerifiedOuterProof<P> {
    // key_hash is recomputed from the vk itself; bb independently asserts key_hash == poseidon2(vk),
    // so passing a self-computed hash is sound — and the registry pins WHICH vks are trusted.
    let vk_hash = Poseidon2::hash(vk, VK_FIELDS);
    verify_honk_proof(vk, proof, public_inputs, vk_hash);

    let parsed = parse_public_inputs::<P>(public_inputs);

    assert(parsed.domain == domain, "wrong service domain");
    assert(parsed.scope == scope, "wrong service scope");

    let nt = parsed.nullifier_type;
    let is_standard = (nt == NULLIFIER_TYPE_NON_SALTED)
        | (nt == NULLIFIER_TYPE_SALTED)
        | (nt == NULLIFIER_TYPE_NONE);
    let is_mock = (nt == NULLIFIER_TYPE_NON_SALTED_MOCK) | (nt == NULLIFIER_TYPE_SALTED_MOCK);

    assert(is_standard | dev_mode, "nullifier type requires dev mode");

    // When the prover hides the private nullifier, the canonical circuit sets scoped_nullifier
    // to 0 (see calculate_scoped_nullifier in the circuits repo's commitment libs) and the
    // type to NULLIFIER_TYPE_NONE, except for a ZKR (mock) document, which keeps its mock type.
    // Salted and non-salted proofs must carry a nullifier.
    assert(
        (nt == NULLIFIER_TYPE_NONE) | is_mock | (parsed.scoped_nullifier != 0),
        "zero scoped nullifier",
    );

    // Every expected commitment must match a distinct param-commitment slot, in any order. The
    // order is not contractual — the prover decides the subproof (and thus slot) order and the
    // ZKPassport SDK itself matches by membership, so e.g. a {constraint, bind} pair may arrive
    // either way across SDK versions.
    let mut used = [false; P];
    for i in 0..P {
        let mut found = false;
        for j in 0..P {
            let hit =
                (!used[j]) & (!found) & (parsed.param_commitments[j] == expected_commitments[i]);
            used[j] = used[j] | hit;
            found = found | hit;
        }
        assert(found, "param commitment mismatch");
    }

    VerifiedOuterProof { parsed, vk_hash }
}

/// The tier of a verification method: `VERIFICATION_TIER_GOVERNMENT_SIGNED` for 100-199,
/// `VERIFICATION_TIER_DEVICE_ATTESTED` for 200-299, 0 for anything else.
pub fn verification_tier(method: Field) -> Field {
    let small = method as u32;
    if (small as Field == method) & (small >= 100) & (small < 200) {
        VERIFICATION_TIER_GOVERNMENT_SIGNED
    } else if (small as Field == method) & (small >= 200) & (small < 300) {
        VERIFICATION_TIER_DEVICE_ATTESTED
    } else {
        0
    }
}

mod test {
    use crate::verify::{verification_tier, verify_outer_proof_core};
    // NOTE: nargo test no-ops the recursion opcode — these tests cover parsing/policy/commitment
    // logic only. Real recursion coverage lives in test-harness/test-recursive-verification.sh (bb verify).

    #[test(should_fail_with = "wrong service domain")]
    fn wrong_domain_rejected() {
        let vk = [0; 115];
        let proof = [0; 458];
        let pis = crate::fixtures::FIXTURE_PUBLIC_INPUTS;
        let _ = verify_outer_proof_core::<1>(vk, proof, pis, 0xbad, 0, false, [pis[5]]);
    }

    #[test(should_fail_with = "wrong service scope")]
    fn wrong_scope_rejected() {
        let vk = [0; 115];
        let proof = [0; 458];
        let pis = crate::fixtures::FIXTURE_PUBLIC_INPUTS;
        let _ = verify_outer_proof_core::<1>(vk, proof, pis, 0, 0xbad, false, [pis[5]]);
    }

    #[test]
    fn verification_tiers() {
        assert(verification_tier(100) == 1);
        assert(verification_tier(199) == 1);
        assert(verification_tier(200) == 2);
        assert(verification_tier(201) == 2);
        assert(verification_tier(99) == 0);
        assert(verification_tier(300) == 0);
        assert(verification_tier(0x100000064) == 0); // 2^32 + 100
    }

    #[test(should_fail_with = "param commitment mismatch")]
    fn wrong_commitment_rejected() {
        let vk = [0; 115];
        let proof = [0; 458];
        let pis = crate::fixtures::FIXTURE_PUBLIC_INPUTS;
        let _ = verify_outer_proof_core::<1>(vk, proof, pis, 0, 0, false, [0x1234]);
    }

    #[test(should_fail_with = "nullifier type requires dev mode")]
    fn mock_nullifier_needs_dev_mode() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::fixtures::FIXTURE_PUBLIC_INPUTS;
        pis[6] = 2; // NON_SALTED_MOCK
        let _ = verify_outer_proof_core::<1>(vk, proof, pis, 0, 0, false, [pis[5]]);
    }

    // A ZKR (mock) document keeps its mock nullifier type when the prover hides the private
    // nullifier, so its scoped nullifier is 0.
    #[test]
    fn mock_nullifier_type_with_zero_nullifier_passes_in_dev_mode() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::fixtures::FIXTURE_PUBLIC_INPUTS;
        pis[7] = 0; // scoped_nullifier
        pis[6] = 2; // NON_SALTED_MOCK
        let _ = verify_outer_proof_core::<1>(vk, proof, pis, 0, 0, true, [pis[5]]);
        pis[6] = 3; // SALTED_MOCK
        let _ = verify_outer_proof_core::<1>(vk, proof, pis, 0, 0, true, [pis[5]]);
    }

    #[test(should_fail_with = "nullifier type requires dev mode")]
    fn mock_nullifier_type_with_zero_nullifier_needs_dev_mode() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::fixtures::FIXTURE_PUBLIC_INPUTS;
        pis[6] = 2; // NON_SALTED_MOCK
        pis[7] = 0; // scoped_nullifier
        let _ = verify_outer_proof_core::<1>(vk, proof, pis, 0, 0, false, [pis[5]]);
    }

    #[test(should_fail_with = "zero scoped nullifier")]
    fn standard_nullifier_type_with_zero_nullifier_rejected() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::fixtures::FIXTURE_PUBLIC_INPUTS;
        pis[6] = 0; // NON_SALTED
        pis[7] = 0; // scoped_nullifier
        let _ = verify_outer_proof_core::<1>(vk, proof, pis, 0, 0, true, [pis[5]]);
    }

    // [a, b] must accept a proof carrying [b, a] — the SDK does not fix the subproof (and
    // thus param-commitment) order. Uses two commitment slots, an outer_count_5 proof.
    #[test]
    fn accepts_swapped_commitments() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = [0; 11];
        for i in 0..5 {
            pis[i] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[i];
        }
        // K=5 layout: [5], [6] are the two param commitments; tail moves to [7..10].
        pis[5] = 0xaaaa;
        pis[6] = 0xbbbb;
        pis[7] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[6]; // nullifier_type
        pis[8] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[7]; // scoped_nullifier
        pis[9] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[8]; // oprf_pk_hash
        pis[10] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[9]; // verification_method
        let out = verify_outer_proof_core::<2>(vk, proof, pis, 0, 0, false, [0xbbbb, 0xaaaa]);
        assert(out.parsed.param_commitments[0] == 0xaaaa);
        assert(out.parsed.param_commitments[1] == 0xbbbb);
    }

    // A duplicated expectation must not be satisfiable by one slot: [a, a] vs {a, b} fails —
    // each expectation consumes a distinct slot, so coverage is preserved.
    #[test(should_fail_with = "param commitment mismatch")]
    fn rejects_duplicate_expectation_over_single_slot() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = [0; 11];
        for i in 0..5 {
            pis[i] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[i];
        }
        pis[5] = 0xaaaa;
        pis[6] = 0xbbbb;
        pis[7] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[6];
        pis[8] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[7];
        pis[9] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[8];
        pis[10] = crate::fixtures::FIXTURE_PUBLIC_INPUTS[9];
        let _ = verify_outer_proof_core::<2>(vk, proof, pis, 0, 0, false, [0xaaaa, 0xaaaa]);
    }

    // IMP-1: NULLIFIER_TYPE_NONE (=4) is a privacy-maximising, no-uniqueness mode -- the
    // canonical circuit forces scoped_nullifier == 0 whenever it's used, so it must be exempt
    // from the "zero scoped nullifier" assert (which exists to catch a salted or non-salted proof
    // sending a zero nullifier). This must still pass verify_outer_proof_core.
    #[test]
    fn none_nullifier_type_with_zero_nullifier_passes() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::fixtures::FIXTURE_PUBLIC_INPUTS;
        pis[6] = 4; // NULLIFIER_TYPE_NONE
        pis[7] = 0; // scoped_nullifier
        let out = verify_outer_proof_core::<1>(vk, proof, pis, 0, 0, false, [pis[5]]);
        assert(out.parsed.nullifier_type == 4);
        assert(out.parsed.scoped_nullifier == 0);
    }
}
