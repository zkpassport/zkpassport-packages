use crate::constants::{
    NULLIFIER_TYPE_NON_SALTED, NULLIFIER_TYPE_NONE, NULLIFIER_TYPE_SALTED, PROOF_FIELDS, VK_FIELDS,
};
use crate::parse::{parse_public_inputs, ParsedPublicInputs};
use bb_proof_verification::verify_honk_proof;
use poseidon::poseidon2::Poseidon2;

pub struct VerifiedOuterProof<let K: u32> {
    pub parsed: ParsedPublicInputs<K>,
    pub vk_hash: Field,
}

/// Stateless SubVerifier analog: recursion + scope binding + nullifier-type policy +
/// L1-strict param-commitment matching (every slot, positionally, fully consumed).
/// Does NOT check: registry roots, vk acceptance, OPRF binding (registry view — Task 6),
/// or freshness (needs a PrivateContext — Task 11).
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

    // L1 SubVerifier step 6
    assert(parsed.service_scope == scope, "wrong service scope");
    assert(parsed.service_subscope == subscope, "wrong service subscope");

    // L1 SubVerifier step 8: mock/unknown nullifier types need dev_mode
    let nt = parsed.nullifier_type;
    let is_standard = (nt == NULLIFIER_TYPE_NON_SALTED)
        | (nt == NULLIFIER_TYPE_SALTED)
        | (nt == NULLIFIER_TYPE_NONE);
    assert(is_standard | dev_mode, "nullifier type requires dev mode");
    // NULLIFIER_TYPE_NONE (=4) means the private nullifier was deliberately hidden by the
    // prover -- the canonical circuit forces scoped_nullifier == 0 in that case (see
    // circuits/src/noir/lib/commitment/scoped-nullifier/src/lib.nr:86-89 and tests.nr:225-226),
    // so a zero nullifier is only legitimate for NONE and must still be rejected for every
    // other type. The actual "don't burn a zero-value global slot" guard lives one layer up,
    // in emit_uniqueness_nullifier (zkpassport/src/verify.nr) -- that's the function that would
    // otherwise push a nullifier and permanently block the app.
    assert((nt == NULLIFIER_TYPE_NONE) | (parsed.scoped_nullifier != 0), "zero scoped nullifier");

    // L1 SubVerifier step 7 — strict: every commitment slot matched exactly once, in order.
    // (voice's membership-only check would let an extra unchecked commitment ride along)
    for i in 0..K - 3 {
        assert(
            parsed.param_commitments[i] == expected_commitments[i],
            "param commitment mismatch",
        );
    }

    VerifiedOuterProof { parsed, vk_hash }
}

mod test {
    use crate::core::verify_outer_proof_core;
    // NOTE: nargo test no-ops the recursion opcode — this test covers parsing/policy/commitment
    // logic only. Real recursion coverage lives in harness/run-harness.sh (bb verify).
    // Reuse FIXTURE_PIS from parse.nr's test module (already pub from Task 7).

    #[test(should_fail_with = "wrong service scope")]
    fn wrong_scope_rejected() {
        let vk = [0; 115];
        let proof = [0; 458];
        let pis = crate::parse::test::FIXTURE_PIS;
        let _ = verify_outer_proof_core::<4>(vk, proof, pis, 0xbad, 0, false, [pis[5]]);
    }

    #[test(should_fail_with = "param commitment mismatch")]
    fn wrong_commitment_rejected() {
        let vk = [0; 115];
        let proof = [0; 458];
        let pis = crate::parse::test::FIXTURE_PIS;
        let _ = verify_outer_proof_core::<4>(vk, proof, pis, 0, 0, false, [0x1234]);
    }

    #[test(should_fail_with = "nullifier type requires dev mode")]
    fn mock_nullifier_needs_dev_mode() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::parse::test::FIXTURE_PIS;
        pis[6] = 2; // NON_SALTED_MOCK
        let _ = verify_outer_proof_core::<4>(vk, proof, pis, 0, 0, false, [pis[5]]);
    }

    // IMP-1: NULLIFIER_TYPE_NONE (=4) is a privacy-maximising, no-uniqueness mode -- the
    // canonical circuit forces scoped_nullifier == 0 whenever it's used, so it must be exempt
    // from the "zero scoped nullifier" assert (which exists to catch every OTHER type sending a
    // zero nullifier). This must still pass verify_outer_proof_core.
    #[test]
    fn none_nullifier_type_with_zero_nullifier_passes() {
        let vk = [0; 115];
        let proof = [0; 458];
        let mut pis = crate::parse::test::FIXTURE_PIS;
        pis[6] = 4; // NULLIFIER_TYPE_NONE
        pis[7] = 0; // scoped_nullifier
        let out = verify_outer_proof_core::<4>(vk, proof, pis, 0, 0, false, [pis[5]]);
        assert(out.parsed.nullifier_type == 4);
        assert(out.parsed.scoped_nullifier == 0);
    }
}
