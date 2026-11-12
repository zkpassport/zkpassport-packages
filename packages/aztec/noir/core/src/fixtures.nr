//! Pinned test fixtures shared across this crate's test modules, and the conformance
//! anchors for the parameter-commitment scheme: fixed example policies and the commitment
//! each must produce. Two independent implementations are held to the anchors: the
//! circuits-repo Noir libs (tests in this crate) and the @zkpassport/utils TS SDK
//! (test-harness/fixture-conformance.test.ts, which parses this file at test time).
//! An anchor only changes when the scheme itself changes; a stale one fails both suites.

/// age_commitment(18, 0): an 18+ policy with no maximum.
pub(crate) global AGE_18_COMMITMENT: Field =
    0x2ccd6b1a6a0758a11ad3531939e69db3e11adbe90131cb38b69df90d55887d83;

/// birthdate_commitment(-631152000, 978220800): born from 1950-01-01 to 2000-12-31.
pub(crate) global BIRTHDATE_COMMITMENT: Field =
    0x1ff20dad03ccac18daf099e88f97b883334bac398b81100f99244158eb242627;

/// expiry_date_commitment(1798761600, 0): expires on 2027-01-01 or later.
pub(crate) global EXPIRY_DATE_COMMITMENT: Field =
    0x2f13cf0dbd16ac2637f3b19ca631933220ed96d4922e9fafcbc5b27a2df59de9;

/// nationality_inclusion_commitment(["FRA", "DEU", "ITA"]).
pub(crate) global NATIONALITY_INCLUSION_COMMITMENT: Field =
    0x2dc5e592e38eeb5eee6d4a8b977465cfda38f3f278567b46a50a8d1a6fc0a5b4;

/// nationality_exclusion_commitment(["PRK", "IRN", "SYR"]), a list given unsorted.
pub(crate) global NATIONALITY_EXCLUSION_COMMITMENT: Field =
    0x2837d9da8e0b7bf3895bdd5acaeb4aef29a4114c2621e9d046f2db11c599ccec;

/// issuing_country_inclusion_commitment(["NLD", "BEL", "LUX"]).
pub(crate) global ISSUING_COUNTRY_INCLUSION_COMMITMENT: Field =
    0x0900b574ac5a979c7c62f154bff35fd50c4794bf1af41c6f2d7935f1d9a0a9a0;

/// issuing_country_exclusion_commitment(["RUS", "BLR"]), a list given unsorted.
pub(crate) global ISSUING_COUNTRY_EXCLUSION_COMMITMENT: Field =
    0x21bf8243ed1f5a53489a829b7320a494600c87dd72c0a3f88ed580eded7d0fd1;

/// disclose_commitment over a nationality-only TD3 mask: bytes 54..=56 disclosed as "AUS".
pub global DISCLOSE_COMMITMENT: Field =
    0x1b6d3f9e55b8456c4baf5f21d14e5e425b6d23df44e3067f561b0ab41cf7b59f;

/// An account address to bind a proof to. @zkpassport/utils' bind conformance vector uses the
/// same one.
pub(crate) global BIND_ACCOUNT: Field =
    0x1122334455667788990011223344556677889900112233445566778899001122;

/// bind_commitment(BIND_ACCOUNT, 11155111, 679261766): the account bound to Aztec testnet, whose
/// L1 chain id and rollup version these are.
pub(crate) global BIND_COMMITMENT: Field =
    0x1dc2c4316a74305242c9be364e154f3e5ef7e1c95a0ec0d7f5ef81f8dd2e4d8f;

/// Public inputs transcribed from a real outer_count_4 proof (a byte-disclosure check against a
/// synthetic certificate registry and a circuits release's circuit registry, current_date
/// 2050-01-01), in the K=4 layout parse.nr decodes.
pub(crate) global FIXTURE_PUBLIC_INPUTS: [Field; 9] = [
    0x27465e0ef850b441de340e5d0223edc6e21b6902fb57550bb367b5df382375f9, // cert root
    0x0289526299c3d1afa2ad1113678fb426ed587156a1a4ba622023d81989728210, // circuit root
    0x00000000000000000000000000000000000000000000000000000000967a7600, // current_date
    0x0000000000000000000000000000000000000000000000000000000000000000, // domain
    0x0000000000000000000000000000000000000000000000000000000000000000, // scope
    0x0d9b28951df317e973975cd74ecffd626d07d5a0e19eed6d19612bb70f32862b, // param_commitments[0]
    0x0000000000000000000000000000000000000000000000000000000000000000, // nullifier_type
    0x1c2de0aff0b433e96e0f1da31cec1d9e8b5e98c75d8d5c2e3e255ad689fe6354, // scoped_nullifier
    0x0000000000000000000000000000000000000000000000000000000000000000, // oprf_pk_hash
];

// A real age proof for tests, written by test-harness/generate-proof-fixtures.sh.
pub mod proof;

// The age proof bound to TXE's network.
pub mod txe;
