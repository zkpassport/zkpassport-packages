// TXE no-ops the recursion opcode, so these tests cover what verify_zkpassport_proof does with the
// capsules a sender's PXE hands it, not proof validity: test-harness covers that.
use crate::VerifierTest;
use aztec::{
    oracle::capsules,
    protocol::{address::AztecAddress, traits::FromField},
    test::helpers::test_environment::TestEnvironment,
};
use zkpassport::app_attest::{
    ANDROID_APP_ID_HASH, ANDROID_INTEGRITY_PUBLIC_KEY_HASH, APPLE_ROOT_KEY_HASH,
    EMPTY_REVOCATION_ROOT, GOOGLE_ECDSA_ROOT_KEY_HASH, GOOGLE_RSA_ROOT_KEY_HASH,
    IOS_APP_CLIP_APP_ID_HASH, IOS_APP_ID_HASH,
};
use zkpassport::commitments::{age_commitment, disclose_commitment, sanctions_commitment};
use zkpassport::constants::{
    APP_ATTEST_ENV_PRODUCTION, DISCLOSE_CAPSULE_SLOT, FACE_MATCH_CAPSULE_SLOT,
    FACE_MATCH_MODE_REGULAR, FACE_MATCH_MODE_STRICT, NULLIFIER_TYPE_SALTED, PI_PARAMS_START,
    PROOF_CAPSULE_SLOT, PROOF_FIELDS, SANCTIONS_CAPSULE_SLOT, VK_FIELDS,
};
use zkpassport::face_match::FaceMatch;
use zkpassport::fixtures::{
    proof::{
        AGE_FIXTURE_BIND_ADDRESS, AGE_FIXTURE_BLOB, AGE_FIXTURE_CERT_ROOT, AGE_FIXTURE_CIRCUIT_ROOT,
        AGE_FIXTURE_CIRCUIT_VERSION, AGE_FIXTURE_CURRENT_DATE, AGE_FIXTURE_VK_HASH,
    },
    txe::age_fixture_blob_for_txe,
};
use zkpassport::version::circuit_version;
use zkpassport_registry_contract::{
    local_network_registry::{
        deploy_local_network_registry, LOCAL_NETWORK_REGISTRY_ADDRESS, LOCAL_NETWORK_REGISTRY_ADMIN,
        LOCAL_NETWORK_REGISTRY_OPERATOR, seed_local_network_registry,
    },
    types::{REGISTRY_ATTESTATION_REVOCATION, REGISTRY_SANCTIONS},
    ZKPassportRegistry,
};

global DAY: u64 = 86400;
global SANCTIONS_ROOT: Field = 0x5a5a;
global OLD_SANCTIONS_ROOT: Field = 0x5b5b;
global OPRF_PK_HASH: Field = 0x6f707266;
global REVOCATION_ROOT: Field = 0x7e01;

// The age fixture's public inputs end at the end of its blob, before the circuits version
global FIXTURE_PUBLIC_INPUTS_END: u32 = VK_FIELDS + PROOF_FIELDS + 11;

// The registry with the fixture's roots and vk, an OPRF key hash, and `sanctions_roots` as
// (root, valid from) in publishing order, then the test contract. Time ends a day and a second
// after the proof's date, past the registry's delay and inside the proof's validity period.
unconstrained fn setup<let N: u32>(
    sanctions_roots: [(Field, u64); N],
) -> (TestEnvironment, AztecAddress) {
    setup_enabling(sanctions_roots, [])
}

// `setup`, with each of `versions` enabled in the registry too, without accepting any vk under it
unconstrained fn setup_enabling<let N: u32, let M: u32>(
    sanctions_roots: [(Field, u64); N],
    versions: [Field; M],
) -> (TestEnvironment, AztecAddress) {
    setup_with(sanctions_roots, [], versions)
}

// `setup`, with `revocation_roots` as (root, valid from) published to the attestation revocation
// registry in order
unconstrained fn setup_with_revocation_roots<let N: u32>(
    revocation_roots: [(Field, u64); N],
) -> (TestEnvironment, AztecAddress) {
    setup_with([], revocation_roots, [])
}

unconstrained fn setup_with<let N: u32, let R: u32, let M: u32>(
    sanctions_roots: [(Field, u64); N],
    revocation_roots: [(Field, u64); R],
    versions: [Field; M],
) -> (TestEnvironment, AztecAddress) {
    let mut env = TestEnvironment::new();
    let _ =
        deploy_local_network_registry(&mut env, "@zkpassport_registry_contract/ZKPassportRegistry");
    seed_local_network_registry(
        &mut env,
        AGE_FIXTURE_CIRCUIT_VERSION,
        AGE_FIXTURE_CERT_ROOT,
        AGE_FIXTURE_CIRCUIT_ROOT,
        AGE_FIXTURE_VK_HASH,
        AGE_FIXTURE_CURRENT_DATE - 100,
    );

    publish_roots(&mut env, REGISTRY_SANCTIONS, sanctions_roots);
    publish_roots(&mut env, REGISTRY_ATTESTATION_REVOCATION, revocation_roots);
    let registry = ZKPassportRegistry::at(LOCAL_NETWORK_REGISTRY_ADDRESS);
    let _ = env.call_public(LOCAL_NETWORK_REGISTRY_ADMIN, registry.set_oprf_pk_hash(OPRF_PK_HASH));
    for version in versions {
        let _ = env.call_public(
            LOCAL_NETWORK_REGISTRY_ADMIN,
            registry.set_version_status(version, true),
        );
    }

    env.mine_block_at(AGE_FIXTURE_CURRENT_DATE + DAY + 1);

    let verifier = env.deploy("VerifierTest").without_initializer();
    (env, verifier)
}

// Publishes `roots` as (root, valid from) to the local network registry's `registry_id`, in order
unconstrained fn publish_roots<let N: u32>(
    env: &mut TestEnvironment,
    registry_id: Field,
    roots: [(Field, u64); N],
) {
    let registry = ZKPassportRegistry::at(LOCAL_NETWORK_REGISTRY_ADDRESS);
    let mut current_root = 0;
    for i in 0..N {
        let (root, valid_from) = roots[i];
        let _ = env.call_public(
            LOCAL_NETWORK_REGISTRY_OPERATOR,
            registry.update_root(registry_id, root, current_root, valid_from),
        );
        current_root = root;
    }
}

// The age fixture is a real outer_count_5 proof of {age(18, 0), bind}. Swapping its age commitment
// for another gives a proof of {that, bind} with the fixture's roots, date, vk and bound address.
fn fixture_with(commitment: Field) -> [Field; 585] {
    let mut blob = age_fixture_blob_for_txe();
    let params_start = VK_FIELDS + PROOF_FIELDS + PI_PARAMS_START;
    for i in params_start..params_start + 2 {
        if blob[i] == age_commitment(18, 0) {
            blob[i] = commitment;
        }
    }
    blob
}

// A passport's disclosure of its document type and of `field` at `index`, nothing else
fn passport_disclosure<let N: u32>(index: u32, field: [u8; N]) -> ([bool; 90], [u8; 90]) {
    let mut mask = [false; 90];
    let mut bytes = [0 as u8; 90];
    for i in 0..2 {
        mask[i] = true;
        bytes[i] = "P<".as_bytes()[i];
    }
    for i in 0..N {
        mask[index + i] = true;
        bytes[index + i] = field[i];
    }
    (mask, bytes)
}

// The disclose capsule's layout: mask ‖ bytes, one value per Field
fn disclose_payload(mask: [bool; 90], bytes: [u8; 90]) -> [Field; 180] {
    let mut payload = [0; 180];
    for i in 0..90 {
        payload[i] = mask[i] as Field;
        payload[90 + i] = bytes[i] as Field;
    }
    payload
}

// Stores the capsules the sender's PXE hands the verifier, scoped to the sender
unconstrained fn deliver(
    env: &mut TestEnvironment,
    verifier: AztecAddress,
    sender: AztecAddress,
    blob: Option<[Field; 585]>,
    disclose_payload: Option<[Field; 180]>,
    sanctions_root: Option<Field>,
) {
    env.utility_context_at(verifier, |_| {
        if blob.is_some() {
            capsules::store(verifier, PROOF_CAPSULE_SLOT, blob.unwrap(), sender);
        }
        if disclose_payload.is_some() {
            capsules::store(
                verifier,
                DISCLOSE_CAPSULE_SLOT,
                disclose_payload.unwrap(),
                sender,
            );
        }
        if sanctions_root.is_some() {
            capsules::store(
                verifier,
                SANCTIONS_CAPSULE_SLOT,
                sanctions_root.unwrap(),
                sender,
            );
        }
    });
}

#[test]
unconstrained fn verifies_an_age_proof() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(age_fixture_blob_for_txe()),
        Option::none(),
        Option::none(),
    );

    assert(env.call_private(sender, VerifierTest::at(verifier).verify_age(user)) != 0);
}

#[test]
unconstrained fn verifies_an_age_proof_for_the_user_it_is_bound_to() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(age_fixture_blob_for_txe()),
        Option::none(),
        Option::none(),
    );

    assert(env.call_private(sender, VerifierTest::at(verifier).verify_age_for_user(user)) != 0);
}

#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn rejects_an_age_proof_for_a_user_it_is_not_bound_to() {
    let (mut env, verifier) = setup([]);
    let other_user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS + 1);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(age_fixture_blob_for_txe()),
        Option::none(),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_age_for_user(other_user));
}

// The age fixture's capsule, claiming another circuits release
fn fixture_claiming(version: Field) -> [Field; 585] {
    let mut blob = age_fixture_blob_for_txe();
    blob[584] = version;
    blob
}

unconstrained fn verify_age_claiming<let M: u32>(version: Field, enabled_versions: [Field; M]) {
    let (mut env, verifier) = setup_enabling([], enabled_versions);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_claiming(version)),
        Option::none(),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_age(user));
}

#[test(should_fail_with = "unsupported circuits version")]
unconstrained fn rejects_a_proof_claiming_an_older_layout() {
    verify_age_claiming(circuit_version(0, 22, 0), []);
}

#[test(should_fail_with = "unsupported circuits version")]
unconstrained fn rejects_a_proof_claiming_a_newer_layout() {
    verify_age_claiming(circuit_version(0, 24, 0), []);
}

// The registry accepts the fixture's vk under 0.23.0 only, so claiming another 0.23.x release the
// library parses still fails: the registry authenticates the version
#[test(should_fail_with = "version not enabled")]
unconstrained fn rejects_a_proof_claiming_a_release_the_registry_does_not_accept() {
    verify_age_claiming(circuit_version(0, 23, 1), []);
}

// Even with 0.23.1 enabled, the registry accepts the fixture's vk under 0.23.0 only
#[test(should_fail_with = "vk not accepted")]
unconstrained fn rejects_a_proof_claiming_a_release_its_vk_is_not_accepted_under() {
    verify_age_claiming(circuit_version(0, 23, 1), [circuit_version(0, 23, 1)]);
}

#[test(should_fail_with = "circuits version older than the service accepts")]
unconstrained fn rejects_a_proof_older_than_the_services_minimum() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(age_fixture_blob_for_txe()),
        Option::none(),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_age_from_0_23_1(user));
}

#[test(should_fail_with = "missing zkpassport proof capsule")]
unconstrained fn rejects_a_missing_proof_capsule() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_age(user));
}

#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn rejects_a_proof_bound_to_another_address() {
    let (mut env, verifier) = setup([]);
    let other_user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS + 1);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(age_fixture_blob_for_txe()),
        Option::none(),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_age(other_user));
}

#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn rejects_a_proof_bound_to_another_network() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(AGE_FIXTURE_BLOB),
        Option::none(),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_age(user));
}

#[test]
unconstrained fn reads_a_disclosed_nationality() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    let (mask, bytes) = passport_disclosure(54, "FRA".as_bytes());
    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(disclose_commitment(mask, bytes))),
        Option::some(disclose_payload(mask, bytes)),
        Option::none(),
    );

    assert_eq(
        env.call_private(sender, VerifierTest::at(verifier).verify_nationality(user)),
        "FRA".as_bytes(),
    );
}

#[test(should_fail_with = "missing disclose capsule")]
unconstrained fn rejects_a_missing_disclose_capsule() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    let (mask, bytes) = passport_disclosure(54, "FRA".as_bytes());
    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(disclose_commitment(mask, bytes))),
        Option::none(),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_nationality(user));
}

#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn rejects_a_disclose_payload_other_than_the_proofs() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    let (proven_mask, proven_bytes) = passport_disclosure(54, "DEU".as_bytes());
    let (mask, bytes) = passport_disclosure(54, "FRA".as_bytes());
    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(disclose_commitment(proven_mask, proven_bytes))),
        Option::some(disclose_payload(mask, bytes)),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_nationality(user));
}

#[test(should_fail_with = "document type not disclosed")]
unconstrained fn rejects_a_nationality_without_the_document_type() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    let (mut mask, mut bytes) = passport_disclosure(54, "FRA".as_bytes());
    mask[0] = false;
    bytes[0] = 0;
    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(disclose_commitment(mask, bytes))),
        Option::some(disclose_payload(mask, bytes)),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_nationality(user));
}

#[test]
unconstrained fn reads_a_disclosed_full_name() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    let full_name = "ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<".as_bytes();
    let (mask, bytes) = passport_disclosure(5, full_name);
    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(disclose_commitment(mask, bytes))),
        Option::some(disclose_payload(mask, bytes)),
        Option::none(),
    );

    assert_eq(
        env.call_private(sender, VerifierTest::at(verifier).verify_full_name(user)),
        full_name,
    );
}

#[test(should_fail_with = "full name not disclosed")]
unconstrained fn rejects_a_partial_name_for_a_full_name_query() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    let (mask, bytes) = passport_disclosure(5, "ERIKSSON<<".as_bytes());
    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(disclose_commitment(mask, bytes))),
        Option::some(disclose_payload(mask, bytes)),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_full_name(user));
}

#[test]
unconstrained fn accepts_a_latest_sanctions_root() {
    let (mut env, verifier) = setup([(SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - DAY)]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(sanctions_commitment(SANCTIONS_ROOT, true))),
        Option::none(),
        Option::some(SANCTIONS_ROOT),
    );

    assert_eq(
        env.call_private(sender, VerifierTest::at(verifier).verify_sanctions(user)),
        SANCTIONS_ROOT,
    );
}

#[test(should_fail_with = "invalid sanctions registry root")]
unconstrained fn rejects_a_sanctions_root_the_registry_does_not_have() {
    let (mut env, verifier) = setup([(SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - DAY)]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(sanctions_commitment(OLD_SANCTIONS_ROOT, true))),
        Option::none(),
        Option::some(OLD_SANCTIONS_ROOT),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_sanctions(user));
}

#[test(should_fail_with = "invalid sanctions registry root")]
unconstrained fn rejects_a_sanctions_root_replaced_more_than_a_window_before_the_proof() {
    let (mut env, verifier) = setup([
        (OLD_SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - 3 * DAY),
        (SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - 2 * DAY),
    ]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(sanctions_commitment(OLD_SANCTIONS_ROOT, true))),
        Option::none(),
        Option::some(OLD_SANCTIONS_ROOT),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_sanctions(user));
}

// Valid at the proof's date, but replaced more than a window before the anchor block
#[test]
unconstrained fn accepts_a_sanctions_root_replaced_after_the_proof_was_made() {
    let (mut env, verifier) = setup([
        (OLD_SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - 3 * DAY),
        (SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE),
    ]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(sanctions_commitment(OLD_SANCTIONS_ROOT, true))),
        Option::none(),
        Option::some(OLD_SANCTIONS_ROOT),
    );

    assert_eq(
        env.call_private(sender, VerifierTest::at(verifier).verify_sanctions(user)),
        OLD_SANCTIONS_ROOT,
    );
}

#[test(should_fail_with = "missing sanctions capsule")]
unconstrained fn rejects_a_missing_sanctions_capsule() {
    let (mut env, verifier) = setup([(SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - DAY)]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(sanctions_commitment(SANCTIONS_ROOT, true))),
        Option::none(),
        Option::none(),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_sanctions(user));
}

// Both roots are valid at the proof's date; the capsule carries the one the proof didn't use
#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn rejects_a_sanctions_root_other_than_the_proofs() {
    let (mut env, verifier) = setup([
        (OLD_SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - 3 * DAY),
        (SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE),
    ]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(sanctions_commitment(SANCTIONS_ROOT, true))),
        Option::none(),
        Option::some(OLD_SANCTIONS_ROOT),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_sanctions(user));
}

#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn rejects_a_non_strict_sanctions_proof_for_a_strict_query() {
    let (mut env, verifier) = setup([(SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - DAY)]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(sanctions_commitment(SANCTIONS_ROOT, false))),
        Option::none(),
        Option::some(SANCTIONS_ROOT),
    );

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_sanctions(user));
}

#[test]
unconstrained fn accepts_a_non_strict_sanctions_proof_for_a_non_strict_query() {
    let (mut env, verifier) = setup([(SANCTIONS_ROOT, AGE_FIXTURE_CURRENT_DATE - DAY)]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(sanctions_commitment(SANCTIONS_ROOT, false))),
        Option::none(),
        Option::some(SANCTIONS_ROOT),
    );

    assert_eq(
        env.call_private(sender, VerifierTest::at(verifier).verify_non_strict_sanctions(user)),
        SANCTIONS_ROOT,
    );
}

// A face match from ZKPassport's iOS app, as its proof commits it
fn ios_face_match(mode: u8) -> FaceMatch {
    FaceMatch {
        root_key_leaf: APPLE_ROOT_KEY_HASH,
        environment: APP_ATTEST_ENV_PRODUCTION,
        app_id_hash: IOS_APP_ID_HASH,
        integrity_public_key_hash: 0,
        mode,
        revocation_root: 0,
    }
}

// A strict face match from ZKPassport's Android app, under Google's RSA root key
fn android_face_match() -> FaceMatch {
    FaceMatch {
        root_key_leaf: GOOGLE_RSA_ROOT_KEY_HASH,
        environment: APP_ATTEST_ENV_PRODUCTION,
        app_id_hash: ANDROID_APP_ID_HASH,
        integrity_public_key_hash: ANDROID_INTEGRITY_PUBLIC_KEY_HASH,
        mode: FACE_MATCH_MODE_STRICT,
        revocation_root: EMPTY_REVOCATION_ROOT,
    }
}

// The face match capsule's layout: the parameters in the order the proof commits them
fn face_match_payload(face_match: FaceMatch) -> [Field; 6] {
    [
        face_match.root_key_leaf,
        face_match.environment as Field,
        face_match.app_id_hash,
        face_match.integrity_public_key_hash,
        face_match.mode as Field,
        face_match.revocation_root,
    ]
}

// The age fixture made a salted proof of {face match, bind}: its age commitment swapped for the
// face match's, its nullifier type for a salted one and its OPRF key hash for the registry's. TXE
// doesn't verify the recursion, so swapping these public inputs stands for a real salted proof.
fn salted_fixture_with(face_match: FaceMatch) -> [Field; 585] {
    let mut blob = fixture_with(face_match.commitment());
    blob[FIXTURE_PUBLIC_INPUTS_END - 4] = NULLIFIER_TYPE_SALTED as Field;
    blob[FIXTURE_PUBLIC_INPUTS_END - 2] = OPRF_PK_HASH;
    blob
}

// A salted proof that commits `proven`, verified with a strict face match query, its face match
// capsule holding `delivered`
unconstrained fn verify_salted_strict_face_match(
    proven: FaceMatch,
    delivered: Option<FaceMatch>,
) -> [Field; 2] {
    verify_salted_strict_face_match_under([], proven, delivered)
}

// `verify_salted_strict_face_match`, with `revocation_roots` as (root, valid from) published to
// the attestation revocation registry
unconstrained fn verify_salted_strict_face_match_under<let N: u32>(
    revocation_roots: [(Field, u64); N],
    proven: FaceMatch,
    delivered: Option<FaceMatch>,
) -> [Field; 2] {
    let (mut env, verifier) = setup_with_revocation_roots(revocation_roots);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(salted_fixture_with(proven)),
        Option::none(),
        Option::none(),
    );
    if delivered.is_some() {
        let payload = face_match_payload(delivered.unwrap());
        env.utility_context_at(verifier, |_| {
            capsules::store(verifier, FACE_MATCH_CAPSULE_SLOT, payload, sender);
        });
    }

    env.call_private(sender, VerifierTest::at(verifier).verify_salted_strict_face_match(user))
}

#[test]
unconstrained fn verifies_a_salted_proof_with_a_strict_face_match_from_the_ios_app() {
    let face_match = ios_face_match(FACE_MATCH_MODE_STRICT);

    let result = verify_salted_strict_face_match(face_match, Option::some(face_match));

    assert_eq(result[0], AGE_FIXTURE_BLOB[FIXTURE_PUBLIC_INPUTS_END - 3]);
    assert_eq(result[1], face_match.commitment());
}

#[test]
unconstrained fn verifies_a_face_match_from_the_app_clip() {
    let (mut env, verifier) = setup([]);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let sender = env.create_light_account();

    let mut face_match = ios_face_match(FACE_MATCH_MODE_REGULAR);
    face_match.app_id_hash = IOS_APP_CLIP_APP_ID_HASH;
    let payload = face_match_payload(face_match);
    deliver(
        &mut env,
        verifier,
        sender,
        Option::some(fixture_with(face_match.commitment())),
        Option::none(),
        Option::none(),
    );
    env.utility_context_at(verifier, |_| {
        capsules::store(verifier, FACE_MATCH_CAPSULE_SLOT, payload, sender);
    });

    assert_eq(
        env.call_private(sender, VerifierTest::at(verifier).verify_face_match(user)),
        face_match.commitment(),
    );
}

#[test(should_fail_with = "missing face match capsule")]
unconstrained fn rejects_a_missing_face_match_capsule() {
    let _ = verify_salted_strict_face_match(ios_face_match(FACE_MATCH_MODE_STRICT), Option::none());
}

// Each face match below is the one the proof commits, so only the face match policy rejects it
#[test(should_fail_with = "face match app id not ZKPassport's iOS app or App Clip")]
unconstrained fn rejects_a_face_match_from_another_app() {
    let mut face_match = ios_face_match(FACE_MATCH_MODE_STRICT);
    face_match.app_id_hash = 0x067041deed02d9d2df216a420b50404bdf5bcb0026db2602a4142e380a9d6e2a;

    let _ = verify_salted_strict_face_match(face_match, Option::some(face_match));
}

#[test]
unconstrained fn verifies_a_salted_proof_with_a_strict_face_match_from_the_android_app() {
    let face_match = android_face_match();

    let result = verify_salted_strict_face_match(face_match, Option::some(face_match));

    assert_eq(result[0], AGE_FIXTURE_BLOB[FIXTURE_PUBLIC_INPUTS_END - 3]);
    assert_eq(result[1], face_match.commitment());
}

#[test]
unconstrained fn verifies_an_android_face_match_under_the_registrys_revocation_root() {
    let mut face_match = android_face_match();
    face_match.root_key_leaf = GOOGLE_ECDSA_ROOT_KEY_HASH;
    face_match.revocation_root = REVOCATION_ROOT;

    let result = verify_salted_strict_face_match_under(
        [(REVOCATION_ROOT, AGE_FIXTURE_CURRENT_DATE - 100)],
        face_match,
        Option::some(face_match),
    );

    assert_eq(result[1], face_match.commitment());
}

#[test(should_fail_with = "empty revocation root no longer accepted")]
unconstrained fn rejects_an_android_face_match_under_the_empty_root_once_a_root_is_published() {
    let face_match = android_face_match();

    let _ = verify_salted_strict_face_match_under(
        [(REVOCATION_ROOT, AGE_FIXTURE_CURRENT_DATE - 100)],
        face_match,
        Option::some(face_match),
    );
}

#[test(should_fail_with = "invalid attestation revocation root")]
unconstrained fn rejects_an_android_face_match_under_a_revocation_root_the_registry_lacks() {
    let mut face_match = android_face_match();
    face_match.revocation_root = REVOCATION_ROOT;

    let _ = verify_salted_strict_face_match(face_match, Option::some(face_match));
}

#[test(should_fail_with = "Android face match not under ZKPassport's Play Integrity key")]
unconstrained fn rejects_an_android_face_match_without_the_integrity_key() {
    let mut face_match = android_face_match();
    face_match.integrity_public_key_hash = 0;

    let _ = verify_salted_strict_face_match(face_match, Option::some(face_match));
}

#[test(should_fail_with = "face match mode not the requested one")]
unconstrained fn rejects_a_regular_face_match_for_a_strict_query() {
    let face_match = ios_face_match(FACE_MATCH_MODE_REGULAR);

    let _ = verify_salted_strict_face_match(face_match, Option::some(face_match));
}

#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn rejects_a_face_match_other_than_the_proofs() {
    let mut delivered = ios_face_match(FACE_MATCH_MODE_STRICT);
    delivered.app_id_hash = IOS_APP_CLIP_APP_ID_HASH;

    let _ = verify_salted_strict_face_match(
        ios_face_match(FACE_MATCH_MODE_STRICT),
        Option::some(delivered),
    );
}
