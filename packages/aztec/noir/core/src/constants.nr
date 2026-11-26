// Outer-proof shape
pub global VK_FIELDS: u32 = 115;
pub global PROOF_FIELDS: u32 = 458;

// Public-input layout of a circuits 0.23.x outer proof — mirrors zkpassport-packages
// Constants.sol / lib/Types.sol. For P param commitments: total length = P + 9. An outer_count_K
// proof (a chip read) carries K - 3, an outer_attested_id_count_N proof (a camera read) N.
pub(crate) global PI_CERT_ROOT: u32 = 0;
pub(crate) global PI_CIRCUIT_ROOT: u32 = 1;
pub(crate) global PI_CURRENT_DATE: u32 = 2;
pub(crate) global PI_SCOPE: u32 = 3;
pub(crate) global PI_SUBSCOPE: u32 = 4;
pub global PI_PARAMS_START: u32 = 5;
// Tail (from the end): [len-4] nullifier_type, [len-3] scoped_nullifier, [len-2] oprf_pk_hash,
// [len-1] verification_method

// How the ID's data was verified, the outer proof's last public input, numbered as the L1
// verifier's lib/VerificationMethods.sol numbers them. Tier 1 (100-199): the issuer signed the
// data; tier 2 (200-299): ZKPassport's app attested a camera read of it.
pub global VERIFICATION_METHOD_ICAO_CHIP: Field = 100;
pub global VERIFICATION_METHOD_UIDAI_AADHAAR: Field = 101;
pub global VERIFICATION_METHOD_ATTESTED_CAPTURE_IOS: Field = 200;
pub global VERIFICATION_METHOD_ATTESTED_CAPTURE_ANDROID: Field = 201;
pub global VERIFICATION_TIER_GOVERNMENT_SIGNED: Field = 1;
pub global VERIFICATION_TIER_DEVICE_ATTESTED: Field = 2;

// The proof type of an attested ID entry, as circuits 0.23.0's utils lib numbers it. The circuits
// tag the commitment libs are pinned to predates it.
pub global PROOF_TYPE_ATTESTED_ID: u8 = 11;

// NullifierType — mirrors lib/Types.sol
pub global NULLIFIER_TYPE_NON_SALTED: u8 = 0;
pub global NULLIFIER_TYPE_SALTED: u8 = 1;
pub global NULLIFIER_TYPE_NON_SALTED_MOCK: u8 = 2;
pub global NULLIFIER_TYPE_SALTED_MOCK: u8 = 3;
pub global NULLIFIER_TYPE_NONE: u8 = 4;

// App Attest's production environment and the face match modes, numbered as the circuits'
// facematch lib and lib/Types.sol's Environment and FaceMatchMode number them
pub global APP_ATTEST_ENV_PRODUCTION: u8 = 1;
pub global FACE_MATCH_MODE_REGULAR: u8 = 1;
pub global FACE_MATCH_MODE_STRICT: u8 = 2;

// Capsule slots (app-side delivery convention)
pub global PROOF_CAPSULE_SLOT: Field = 1;
pub global DISCLOSE_CAPSULE_SLOT: Field = 2;
pub global SANCTIONS_CAPSULE_SLOT: Field = 3;
pub global FACE_MATCH_CAPSULE_SLOT: Field = 4;
pub global ATTESTED_ID_CAPSULE_SLOT: Field = 5;

// Freshness: device clock may run ahead of the (past) anchor-block timestamp
pub global CURRENT_DATE_MAX_SKEW: u64 = 3600;

// Parameter commitments: the circuits' fixed country-list length, and the offset from their
// 1900 birthdate epoch to Unix time
pub(crate) global COUNTRY_LIST_LENGTH: u32 = 200;
pub(crate) global SECONDS_BETWEEN_1900_AND_1970: i64 = 2208988800;

// Bound data: the most custom data the 509 bytes hold after a 35-byte address entry, a chain id
// entry with a 4-byte chain id (7) and the custom data entry's 3-byte header
pub global CUSTOM_DATA_MAX_LENGTH: u32 = 464;
// The chain id entry and the custom data entry, at their longest
pub(crate) global BIND_ENTRIES_LENGTH: u32 = 7 + 3 + CUSTOM_DATA_MAX_LENGTH;
