//! Face match: the values a facematch subproof commits to, and the attestation keys of ZKPassport's
//! apps. The values match EVM's `AppAttest` constants and the ZKPassport SDK's.

use crate::commitments::face_match_commitment;

/// Apple's App Attest root key, as the facematch circuits hash it into a root key leaf.
pub global APPLE_ROOT_KEY_LEAF: Field =
    0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b;

/// Google's RSA attestation root key, as the facematch circuits hash it into a root key leaf.
pub global GOOGLE_RSA_ROOT_KEY_LEAF: Field =
    0x16700a2d9168a194fc85f237af5829b5a2be05b8ae8ac4879ada34cf54a9c211;

/// Google's ECDSA (P-384) attestation root key, as the facematch circuits hash it into a root key
/// leaf.
pub global GOOGLE_ECDSA_ROOT_KEY_LEAF: Field =
    0x0e1889bec6c1d686abcf08360ff404f803ab345881ea8cba6aad33b7f7f7ffe0;

/// Google Play Integrity's public key, as the Android facematch circuits hash it. iOS proofs commit
/// to 0 instead.
pub global GOOGLE_PLAY_INTEGRITY_KEY_HASH: Field =
    0x12e3dc7cc8fec0205b51ff21825630865028f3be5bc64a6eec9ee5e71221319f;

/// The App Attest environment of ZKPassport's released apps.
pub global FACE_MATCH_ENVIRONMENT_PRODUCTION: u8 = 1;

pub global FACE_MATCH_MODE_REGULAR: u8 = 1;
pub global FACE_MATCH_MODE_STRICT: u8 = 2;

/// The values a facematch subproof commits to.
pub struct FaceMatch {
    pub root_key_leaf: Field,
    pub environment: u8,
    pub app_id_hash: Field,
    pub integrity_public_key_hash: Field,
    pub mode: u8,
}

impl FaceMatch {
    /// The facematch subproof's commitment over these values.
    pub fn commitment(self) -> Field {
        face_match_commitment(
            self.root_key_leaf,
            self.environment,
            self.app_id_hash,
            self.integrity_public_key_hash,
            self.mode,
        )
    }

    /// Asserts the face match was attested in production by Apple's or Google's root key, with the
    /// integrity key that goes with it, in `mode`. Which apps may attest is the registry's to check.
    pub fn assert_attested(self, mode: u8) {
        assert(
            self.environment == FACE_MATCH_ENVIRONMENT_PRODUCTION,
            "face match not attested in production",
        );
        assert(self.mode == mode, "face match in another mode");

        let apple = self.root_key_leaf == APPLE_ROOT_KEY_LEAF;
        let google = (self.root_key_leaf == GOOGLE_RSA_ROOT_KEY_LEAF)
            | (self.root_key_leaf == GOOGLE_ECDSA_ROOT_KEY_LEAF);
        assert(apple | google, "unknown face match root key");

        let integrity_key = if google {
            GOOGLE_PLAY_INTEGRITY_KEY_HASH
        } else {
            0
        };
        assert(
            self.integrity_public_key_hash == integrity_key,
            "face match integrity key does not match its root key",
        );
    }
}

/// Reads the face match capsule: root key leaf, environment, app id hash, integrity key hash, mode.
pub fn parse_face_match_payload(payload: [Field; 5]) -> FaceMatch {
    let environment = payload[1] as u8;
    assert(environment as Field == payload[1], "face match environment out of range");
    let mode = payload[4] as u8;
    assert(mode as Field == payload[4], "face match mode out of range");

    FaceMatch {
        root_key_leaf: payload[0],
        environment,
        app_id_hash: payload[2],
        integrity_public_key_hash: payload[3],
        mode,
    }
}

mod test {
    use super::{
        APPLE_ROOT_KEY_LEAF, FACE_MATCH_ENVIRONMENT_PRODUCTION, FACE_MATCH_MODE_REGULAR,
        FACE_MATCH_MODE_STRICT, FaceMatch, GOOGLE_ECDSA_ROOT_KEY_LEAF,
        GOOGLE_PLAY_INTEGRITY_KEY_HASH, GOOGLE_RSA_ROOT_KEY_LEAF, parse_face_match_payload,
    };

    global APP_ID_HASH: Field = 0x1234;

    fn ios(mode: u8) -> FaceMatch {
        FaceMatch {
            root_key_leaf: APPLE_ROOT_KEY_LEAF,
            environment: FACE_MATCH_ENVIRONMENT_PRODUCTION,
            app_id_hash: APP_ID_HASH,
            integrity_public_key_hash: 0,
            mode,
        }
    }

    fn android(root_key_leaf: Field) -> FaceMatch {
        FaceMatch {
            root_key_leaf,
            environment: FACE_MATCH_ENVIRONMENT_PRODUCTION,
            app_id_hash: APP_ID_HASH,
            integrity_public_key_hash: GOOGLE_PLAY_INTEGRITY_KEY_HASH,
            mode: FACE_MATCH_MODE_STRICT,
        }
    }

    #[test]
    fn accepts_apple_and_both_google_root_keys() {
        ios(FACE_MATCH_MODE_STRICT).assert_attested(FACE_MATCH_MODE_STRICT);
        android(GOOGLE_RSA_ROOT_KEY_LEAF).assert_attested(FACE_MATCH_MODE_STRICT);
        android(GOOGLE_ECDSA_ROOT_KEY_LEAF).assert_attested(FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match not attested in production")]
    fn rejects_the_development_environment() {
        let mut face_match = ios(FACE_MATCH_MODE_STRICT);
        face_match.environment = 0;
        face_match.assert_attested(FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match in another mode")]
    fn rejects_a_regular_face_match_for_a_strict_one() {
        ios(FACE_MATCH_MODE_REGULAR).assert_attested(FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match in another mode")]
    fn rejects_a_strict_face_match_for_a_regular_one() {
        ios(FACE_MATCH_MODE_STRICT).assert_attested(FACE_MATCH_MODE_REGULAR);
    }

    #[test(should_fail_with = "unknown face match root key")]
    fn rejects_an_unknown_root_key() {
        let mut face_match = ios(FACE_MATCH_MODE_STRICT);
        face_match.root_key_leaf = APPLE_ROOT_KEY_LEAF + 1;
        face_match.assert_attested(FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match integrity key does not match its root key")]
    fn rejects_an_integrity_key_with_apples_root_key() {
        let mut face_match = ios(FACE_MATCH_MODE_STRICT);
        face_match.integrity_public_key_hash = GOOGLE_PLAY_INTEGRITY_KEY_HASH;
        face_match.assert_attested(FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match integrity key does not match its root key")]
    fn rejects_a_google_root_key_without_the_integrity_key() {
        let mut face_match = android(GOOGLE_ECDSA_ROOT_KEY_LEAF);
        face_match.integrity_public_key_hash = 0;
        face_match.assert_attested(FACE_MATCH_MODE_STRICT);
    }

    #[test]
    fn parses_the_capsule_in_its_order() {
        let face_match = parse_face_match_payload([1, 2, 3, 4, 5]);
        assert_eq(face_match.root_key_leaf, 1);
        assert_eq(face_match.environment, 2);
        assert_eq(face_match.app_id_hash, 3);
        assert_eq(face_match.integrity_public_key_hash, 4);
        assert_eq(face_match.mode, 5);
    }

    #[test(should_fail_with = "face match mode out of range")]
    fn rejects_a_mode_wider_than_a_byte() {
        let _ = parse_face_match_payload([1, 1, 3, 0, 258]);
    }

    #[test(should_fail_with = "face match environment out of range")]
    fn rejects_an_environment_wider_than_a_byte() {
        let _ = parse_face_match_payload([1, 257, 3, 0, 2]);
    }
}
