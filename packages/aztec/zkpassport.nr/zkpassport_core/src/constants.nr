// Outer-proof shape (spike-verified against a real proof under aztec v5.2.0)
pub global VK_FIELDS: u32 = 115;
pub global PROOF_FIELDS: u32 = 458;

// Public-input layout — mirrors zkpassport-packages Constants.sol / lib/Types.sol.
// For outer_count_K: total length = K + 5, param commitments = K - 3.
pub global PI_CERT_ROOT: u32 = 0;
pub global PI_CIRCUIT_ROOT: u32 = 1;
pub global PI_CURRENT_DATE: u32 = 2;
pub global PI_SCOPE: u32 = 3;
pub global PI_SUBSCOPE: u32 = 4;
pub global PI_PARAMS_START: u32 = 5;
// Tail (from the end): [len-3] nullifier_type, [len-2] scoped_nullifier, [len-1] oprf_pk_hash

// NullifierType — mirrors lib/Types.sol
pub global NULLIFIER_TYPE_NON_SALTED: u8 = 0;
pub global NULLIFIER_TYPE_SALTED: u8 = 1;
pub global NULLIFIER_TYPE_NON_SALTED_MOCK: u8 = 2;
pub global NULLIFIER_TYPE_SALTED_MOCK: u8 = 3;
pub global NULLIFIER_TYPE_NONE: u8 = 4;

// Capsule slots (app-side delivery convention, following voice)
pub global PROOF_CAPSULE_SLOT: Field = 1;
pub global DISCLOSE_CAPSULE_SLOT: Field = 2;
pub global SANCTIONS_CAPSULE_SLOT: Field = 3;

// Freshness: device clock may run ahead of the (past) anchor-block timestamp
pub global CURRENT_DATE_MAX_SKEW: u64 = 3600;
