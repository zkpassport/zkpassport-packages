//! Pinned test fixtures shared across this crate's test modules, and the conformance
//! anchors for the parameter-commitment scheme: fixed example policies and the commitment
//! each must produce. Two independent implementations are held to the anchors: the
//! circuits-repo Noir libs (tests in this crate) and the @zkpassport/utils TS SDK
//! (test-harness/fixture-conformance.test.ts, which parses this file at test time).
//! An anchor only changes when the scheme itself changes; a stale one fails both suites.

/// age_commitment(18, 0): the age-gate example's policy (18+, no maximum).
pub global AGE_18_COMMITMENT: Field =
    0x2ccd6b1a6a0758a11ad3531939e69db3e11adbe90131cb38b69df90d55887d83;

/// birthdate_commitment(-631152000, 978220800): born from 1950-01-01 to 2000-12-31.
pub global BIRTHDATE_COMMITMENT: Field =
    0x1ff20dad03ccac18daf099e88f97b883334bac398b81100f99244158eb242627;

/// expiry_date_commitment(1798761600, 0): expires on 2027-01-01 or later.
pub global EXPIRY_DATE_COMMITMENT: Field =
    0x2f13cf0dbd16ac2637f3b19ca631933220ed96d4922e9fafcbc5b27a2df59de9;

/// nationality_inclusion_commitment(["FRA", "DEU", "ITA"]).
pub global NATIONALITY_INCLUSION_COMMITMENT: Field =
    0x2dc5e592e38eeb5eee6d4a8b977465cfda38f3f278567b46a50a8d1a6fc0a5b4;

/// nationality_exclusion_commitment(["PRK", "IRN", "SYR"]), a list given unsorted.
pub global NATIONALITY_EXCLUSION_COMMITMENT: Field =
    0x2837d9da8e0b7bf3895bdd5acaeb4aef29a4114c2621e9d046f2db11c599ccec;

/// issuing_country_inclusion_commitment(["NLD", "BEL", "LUX"]).
pub global ISSUING_COUNTRY_INCLUSION_COMMITMENT: Field =
    0x0900b574ac5a979c7c62f154bff35fd50c4794bf1af41c6f2d7935f1d9a0a9a0;

/// issuing_country_exclusion_commitment(["RUS", "BLR"]), a list given unsorted.
pub global ISSUING_COUNTRY_EXCLUSION_COMMITMENT: Field =
    0x21bf8243ed1f5a53489a829b7320a494600c87dd72c0a3f88ed580eded7d0fd1;

/// disclose_commitment over a nationality-only TD3 mask: bytes 54..=56 disclosed as "AUS".
pub global DISCLOSE_COMMITMENT: Field =
    0x1b6d3f9e55b8456c4baf5f21d14e5e425b6d23df44e3067f561b0ab41cf7b59f;

/// Public inputs transcribed from a real outer_count_4 proof (a byte-disclosure check against
/// dev-mode registries, current_date 2050-01-01), in the K=4 layout parse.nr decodes.
pub global FIXTURE_PUBLIC_INPUTS: [Field; 9] = [
    0x14ed64f7a9c0dd706f7ad0b14d70628a15afb58b474ef2b120a392c3b00b3a29, // cert root
    0x028b892fac1779539640734adfb7ae6ee4e495609e98860fa46f67b272499f5a, // circuit root
    0x00000000000000000000000000000000000000000000000000000000967a7600, // current_date
    0x0000000000000000000000000000000000000000000000000000000000000000, // scope
    0x0000000000000000000000000000000000000000000000000000000000000000, // subscope
    0x0d9b28951df317e973975cd74ecffd626d07d5a0e19eed6d19612bb70f32862b, // param_commitments[0]
    0x0000000000000000000000000000000000000000000000000000000000000000, // nullifier_type
    0x1c2de0aff0b433e96e0f1da31cec1d9e8b5e98c75d8d5c2e3e255ad689fe6354, // scoped_nullifier
    0x0000000000000000000000000000000000000000000000000000000000000000, // oprf_pk_hash
];
