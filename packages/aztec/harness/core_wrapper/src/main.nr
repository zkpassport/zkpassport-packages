// Harness wrapper: run the LIBRARY core (zkpassport_core) against a REAL ZKPassport
// `outer_count_4` proof under the Aztec v5.2.0 toolchain (nargo 1.0.0-beta.25, bb
// 5.2.0-nightly). The recursion constraint is a no-op during witness generation, so the
// pass/fail signal is `bb prove` + `bb verify` on this circuit -- see run-harness.sh, which
// also runs the three negative controls.
//
// This is the cross-stack pin for the whole milestone:
//   - `verify_outer_proof_core` actually verifies the fixture's proof recursively;
//   - `disclose_commitment` recomputed in-circuit from (mask, disclosed bytes) matches the
//     param commitment the real disclose_bytes proof published;
//   - the in-circuit poseidon2(vk) matches bb's own vk_hash for the same vk.
use zkpassport_core::commitments::disclose_commitment;
use zkpassport_core::core::verify_outer_proof_core;

global K: u32 = 4;

fn main(
    verification_key: [Field; 115],
    proof: [Field; 458],
    public_inputs: pub [Field; K + 5],
    expected_vk_hash: pub Field,
    disclose_mask: [bool; 90],
    disclosed_bytes: [u8; 90],
) {
    let expected = [disclose_commitment(disclose_mask, disclosed_bytes)];
    let out = verify_outer_proof_core::<K>(
        verification_key,
        proof,
        public_inputs,
        0, // scope    -- fixture used no domain
        0, // subscope
        false, // dev_mode -- fixture nullifier_type is NON_SALTED (0)
        expected,
    );
    // Cross-stack pin: the in-circuit poseidon2(vk) must equal bb's vk_hash from the fixture.
    assert(out.vk_hash == expected_vk_hash, "vk hash mismatch vs fixture");
}
