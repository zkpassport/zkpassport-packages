use crate::app_attest::{
    APPLE_ROOT_KEY_HASH, GOOGLE_ECDSA_ROOT_KEY_HASH, GOOGLE_RSA_ROOT_KEY_HASH,
    IOS_APP_CLIP_APP_ID_HASH, IOS_APP_ID_HASH,
};
use crate::commitments::face_match_commitment;
use crate::constants::APP_ATTEST_ENV_PRODUCTION;

/// What a face match proof commits to: the device attestation it was made under, and the face
/// match mode.
#[derive(Eq)]
pub struct FaceMatch {
    /// The hash of the attestation root key the device's attestation chains to.
    pub root_key_leaf: Field,
    /// The App Attest environment, `APP_ATTEST_ENV_PRODUCTION` for a release build.
    pub environment: u8,
    /// The hash of the attested app's id, as in `app_attest`.
    pub app_id_hash: Field,
    /// The hash of the Play Integrity key on Android, 0 on iOS.
    pub integrity_public_key_hash: Field,
    /// `FACE_MATCH_MODE_REGULAR` or `FACE_MATCH_MODE_STRICT`.
    pub mode: u8,
    /// The Android attestation revocation tree root, 0 on iOS.
    pub revocation_root: Field,
}

impl FaceMatch {
    /// The face match's parameter commitment, as the proof carries it.
    pub fn commitment(self) -> Field {
        face_match_commitment(
            self.root_key_leaf,
            self.environment,
            self.app_id_hash,
            self.integrity_public_key_hash,
            self.mode,
            self.revocation_root,
        )
    }
}

/// Reads a face match out of the face match capsule's payload (`FACE_MATCH_CAPSULE_SLOT`): its
/// parameters in the order the proof commits them, one per Field: root_key_leaf, environment,
/// app_id_hash, integrity_public_key_hash, mode and revocation_root.
pub fn parse_face_match_payload(payload: [Field; 6]) -> FaceMatch {
    // Field-to-integer casts truncate silently, so both casts are range-checked
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
        revocation_root: payload[5],
    }
}

/// Fails unless the L1 verifier would accept `face_match` for a `mode` face match, which for now
/// only an iOS face match passes: one made in production, in `mode`, by ZKPassport's iOS app or
/// App Clip under Apple's App Attest root key, with no integrity key or revocation root.
pub fn assert_face_match_policy(face_match: FaceMatch, mode: u8) {
    assert(
        face_match.environment == APP_ATTEST_ENV_PRODUCTION,
        "face match not made in production",
    );
    assert(face_match.mode == mode, "face match mode not the requested one");

    let root_key = face_match.root_key_leaf;
    assert(
        (root_key != GOOGLE_RSA_ROOT_KEY_HASH) & (root_key != GOOGLE_ECDSA_ROOT_KEY_HASH),
        "Android face match not supported yet",
    );
    assert(root_key == APPLE_ROOT_KEY_HASH, "face match root key not Apple's App Attest root key");

    let app_id = face_match.app_id_hash;
    assert(
        (app_id == IOS_APP_ID_HASH) | (app_id == IOS_APP_CLIP_APP_ID_HASH),
        "face match app id not ZKPassport's iOS app or App Clip",
    );
    assert(face_match.integrity_public_key_hash == 0, "iOS face match commits an integrity key");
    assert(face_match.revocation_root == 0, "iOS face match commits a revocation root");
}

mod test {
    use crate::app_attest::{
        ANDROID_APP_ID_HASH, ANDROID_INTEGRITY_PUBLIC_KEY_HASH, APPLE_ROOT_KEY_HASH,
        EMPTY_REVOCATION_ROOT, GOOGLE_ECDSA_ROOT_KEY_HASH, GOOGLE_RSA_ROOT_KEY_HASH,
        IOS_APP_CLIP_APP_ID_HASH, IOS_APP_ID_HASH,
    };
    use crate::constants::{
        APP_ATTEST_ENV_PRODUCTION, FACE_MATCH_MODE_REGULAR, FACE_MATCH_MODE_STRICT,
    };
    use crate::face_match::{assert_face_match_policy, FaceMatch, parse_face_match_payload};
    use crate::fixtures::{
        FACE_MATCH_IOS_APP_CLIP_REGULAR_COMMITMENT, FACE_MATCH_IOS_STRICT_COMMITMENT,
    };

    fn ios_strict() -> FaceMatch {
        FaceMatch {
            root_key_leaf: APPLE_ROOT_KEY_HASH,
            environment: APP_ATTEST_ENV_PRODUCTION,
            app_id_hash: IOS_APP_ID_HASH,
            integrity_public_key_hash: 0,
            mode: FACE_MATCH_MODE_STRICT,
            revocation_root: 0,
        }
    }

    // A face match as ZKPassport's Android app makes it, under Google's RSA root key
    fn android_strict() -> FaceMatch {
        FaceMatch {
            root_key_leaf: GOOGLE_RSA_ROOT_KEY_HASH,
            environment: APP_ATTEST_ENV_PRODUCTION,
            app_id_hash: ANDROID_APP_ID_HASH,
            integrity_public_key_hash: ANDROID_INTEGRITY_PUBLIC_KEY_HASH,
            mode: FACE_MATCH_MODE_STRICT,
            revocation_root: EMPTY_REVOCATION_ROOT,
        }
    }

    #[test]
    fn commits_like_the_conformance_anchors() {
        assert(ios_strict().commitment() == FACE_MATCH_IOS_STRICT_COMMITMENT);
        let mut app_clip_regular = ios_strict();
        app_clip_regular.app_id_hash = IOS_APP_CLIP_APP_ID_HASH;
        app_clip_regular.mode = FACE_MATCH_MODE_REGULAR;
        assert(app_clip_regular.commitment() == FACE_MATCH_IOS_APP_CLIP_REGULAR_COMMITMENT);
    }

    fn ios_strict_payload() -> [Field; 6] {
        [
            APPLE_ROOT_KEY_HASH,
            APP_ATTEST_ENV_PRODUCTION as Field,
            IOS_APP_ID_HASH,
            0,
            FACE_MATCH_MODE_STRICT as Field,
            0,
        ]
    }

    #[test]
    fn payload_parses_in_commitment_order() {
        let face_match = parse_face_match_payload(ios_strict_payload());
        assert(face_match == ios_strict());
        assert(face_match.commitment() == FACE_MATCH_IOS_STRICT_COMMITMENT);

        let payload = [1, 0, 2, 3, FACE_MATCH_MODE_REGULAR as Field, 4];
        let face_match = parse_face_match_payload(payload);
        assert(face_match.root_key_leaf == 1);
        assert(face_match.environment == 0);
        assert(face_match.app_id_hash == 2);
        assert(face_match.integrity_public_key_hash == 3);
        assert(face_match.mode == FACE_MATCH_MODE_REGULAR);
        assert(face_match.revocation_root == 4);
    }

    // 257 would truncate to production
    #[test(should_fail_with = "face match environment out of range")]
    fn environment_out_of_range_rejected() {
        let mut payload = ios_strict_payload();
        payload[1] = 257;
        let _ = parse_face_match_payload(payload);
    }

    // 258 would truncate to strict
    #[test(should_fail_with = "face match mode out of range")]
    fn mode_out_of_range_rejected() {
        let mut payload = ios_strict_payload();
        payload[4] = 258;
        let _ = parse_face_match_payload(payload);
    }

    #[test]
    fn strict_face_match_from_the_ios_app_accepted() {
        assert_face_match_policy(ios_strict(), FACE_MATCH_MODE_STRICT);
    }

    #[test]
    fn regular_face_match_from_the_ios_app_accepted() {
        let mut face_match = ios_strict();
        face_match.mode = FACE_MATCH_MODE_REGULAR;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_REGULAR);
    }

    #[test]
    fn face_matches_from_the_app_clip_accepted() {
        let mut face_match = ios_strict();
        face_match.app_id_hash = IOS_APP_CLIP_APP_ID_HASH;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
        face_match.mode = FACE_MATCH_MODE_REGULAR;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_REGULAR);
    }

    #[test(should_fail_with = "face match not made in production")]
    fn development_face_match_rejected() {
        let mut face_match = ios_strict();
        face_match.environment = 0;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match mode not the requested one")]
    fn regular_face_match_rejected_for_a_strict_request() {
        let mut face_match = ios_strict();
        face_match.mode = FACE_MATCH_MODE_REGULAR;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match mode not the requested one")]
    fn strict_face_match_rejected_for_a_regular_request() {
        assert_face_match_policy(ios_strict(), FACE_MATCH_MODE_REGULAR);
    }

    #[test(should_fail_with = "face match app id not ZKPassport's iOS app or App Clip")]
    fn face_match_from_another_app_rejected() {
        let mut face_match = ios_strict();
        face_match.app_id_hash = 0x067041deed02d9d2df216a420b50404bdf5bcb0026db2602a4142e380a9d6e2a;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match app id not ZKPassport's iOS app or App Clip")]
    fn android_app_id_under_apple_root_key_rejected() {
        let mut face_match = ios_strict();
        face_match.app_id_hash = ANDROID_APP_ID_HASH;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "iOS face match commits an integrity key")]
    fn ios_face_match_with_an_integrity_key_rejected() {
        let mut face_match = ios_strict();
        face_match.integrity_public_key_hash = ANDROID_INTEGRITY_PUBLIC_KEY_HASH;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "iOS face match commits a revocation root")]
    fn ios_face_match_with_a_revocation_root_rejected() {
        let mut face_match = ios_strict();
        face_match.revocation_root = EMPTY_REVOCATION_ROOT;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "Android face match not supported yet")]
    fn android_face_match_under_google_rsa_root_key_rejected() {
        assert_face_match_policy(android_strict(), FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "Android face match not supported yet")]
    fn android_face_match_under_google_ecdsa_root_key_rejected() {
        let mut face_match = android_strict();
        face_match.root_key_leaf = GOOGLE_ECDSA_ROOT_KEY_HASH;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
    }

    #[test(should_fail_with = "face match root key not Apple's App Attest root key")]
    fn face_match_under_another_root_key_rejected() {
        let mut face_match = ios_strict();
        face_match.root_key_leaf = 0x1234;
        assert_face_match_policy(face_match, FACE_MATCH_MODE_STRICT);
    }
}
