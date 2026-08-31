//! Pinned test fixtures shared across this crate's test modules, and the conformance
//! anchors for the parameter-commitment scheme: fixed example policies and the commitment
//! each must produce. Two independent implementations are held to the anchors: the
//! circuits-repo Noir libs (tests in this crate) and the @zkpassport/utils TS SDK
//! (test-harness/commitment-conformance.test.ts, which parses this file at test time).
//! An anchor only changes when the scheme itself changes; a stale one fails both suites.

/// age_commitment(18, 0): the age-gate example's policy (18+, no maximum).
pub global AGE_18_COMMITMENT: Field =
    0x2ccd6b1a6a0758a11ad3531939e69db3e11adbe90131cb38b69df90d55887d83;

/// disclose_commitment over a nationality-only TD3 mask: bytes 54..=56 disclosed as "AUS".
pub global DISCLOSE_COMMITMENT: Field =
    0x1b6d3f9e55b8456c4baf5f21d14e5e425b6d23df44e3067f561b0ab41cf7b59f;

/// Public inputs transcribed from a real outer_count_4 proof (a byte-disclosure check against
/// dev-mode registries, current_date 2050-01-01), in the K=4 layout parse.nr decodes.
pub global FIXTURE_PUBLIC_INPUTS: [Field; 9] = [
    0x0f9ae818921c73556e67e81ad34a51151ec7be468735abec219226a47496d52d, // cert root
    0x028840d451e834f298e5a898a80f8fbfe9ea6605454a17c83d00a8b79d55753c, // circuit root
    0x00000000000000000000000000000000000000000000000000000000967a7600, // current_date
    0x0000000000000000000000000000000000000000000000000000000000000000, // scope
    0x0000000000000000000000000000000000000000000000000000000000000000, // subscope
    0x0d9b28951df317e973975cd74ecffd626d07d5a0e19eed6d19612bb70f32862b, // param_commitments[0]
    0x0000000000000000000000000000000000000000000000000000000000000000, // nullifier_type
    0x1c2de0aff0b433e96e0f1da31cec1d9e8b5e98c75d8d5c2e3e255ad689fe6354, // scoped_nullifier
    0x0000000000000000000000000000000000000000000000000000000000000000, // oprf_pk_hash
];
