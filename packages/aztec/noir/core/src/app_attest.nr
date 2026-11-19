//! The device attestation constants a face match proof is checked against: ZKPassport's app ids
//! and the platforms' attestation root keys. They mirror the `AppAttest` library of the L1
//! verifier's lib/Constants.sol, which test-harness/fixture-conformance.test.ts checks them
//! against. An app id hash is the little-endian packed Poseidon2 hash of the app id.

/// The app id hash of ZKPassport's iOS app, `YL5MS3Z639.app.zkpassport.zkpassport`.
pub global IOS_APP_ID_HASH: Field =
    0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b;

/// The app id hash of ZKPassport's iOS App Clip, `YL5MS3Z639.app.zkpassport.zkpassport.clip`.
pub global IOS_APP_CLIP_APP_ID_HASH: Field =
    0x1409355f7733451c37093c8aac68611b102c0f270c9961d74ef6cfa6f888d3f0;

/// The app id hash of ZKPassport's Android app, `app.zkpassport.zkpassport`.
pub global ANDROID_APP_ID_HASH: Field =
    0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615d;

/// The hash of Apple's App Attest root certificate public key.
pub global APPLE_ROOT_KEY_HASH: Field =
    0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b;

/// The hash of Google's RSA key attestation root certificate public key.
pub global GOOGLE_RSA_ROOT_KEY_HASH: Field =
    0x16700a2d9168a194fc85f237af5829b5a2be05b8ae8ac4879ada34cf54a9c211;

/// The hash of Google's ECDSA (P-384) key attestation root certificate public key.
pub global GOOGLE_ECDSA_ROOT_KEY_HASH: Field =
    0x0e1889bec6c1d686abcf08360ff404f803ab345881ea8cba6aad33b7f7f7ffe0;

/// The root of the Android attestation revocation tree with no revoked serials.
pub global EMPTY_REVOCATION_ROOT: Field =
    0x23157e6435e936c4698498358363acb2a9a811908c4806e1087677338e1c5525;

/// The hash of the Play Integrity public key the Android app's face matches commit.
pub global ANDROID_INTEGRITY_PUBLIC_KEY_HASH: Field =
    0x12e3dc7cc8fec0205b51ff21825630865028f3be5bc64a6eec9ee5e71221319f;
