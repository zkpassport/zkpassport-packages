// TXE no-ops the recursion opcode, so these tests cover what verify_zkpassport_proof does with the
// capsules a sender's PXE hands it, not proof validity: test-harness covers that.
use crate::VerifierTest;
use aztec::{
    oracle::capsules,
    protocol::{address::AztecAddress, traits::FromField},
    test::helpers::test_environment::TestEnvironment,
};
use zkpassport::commitments::{age_commitment, disclose_commitment, sanctions_commitment};
use zkpassport::constants::{
    DISCLOSE_CAPSULE_SLOT, PI_PARAMS_START, PROOF_CAPSULE_SLOT, PROOF_FIELDS,
    SANCTIONS_CAPSULE_SLOT, VK_FIELDS,
};
use zkpassport::fixtures::{
    proof::{
        AGE_FIXTURE_BIND_ADDRESS, AGE_FIXTURE_BLOB, AGE_FIXTURE_CERT_ROOT, AGE_FIXTURE_CIRCUIT_ROOT,
        AGE_FIXTURE_CURRENT_DATE, AGE_FIXTURE_VK_HASH,
    },
    txe::age_fixture_blob_for_txe,
};
use zkpassport_registry_contract::{
    local_network_registry::{
        deploy_local_network_registry, LOCAL_NETWORK_REGISTRY_ADDRESS,
        LOCAL_NETWORK_REGISTRY_OPERATOR, seed_local_network_registry,
    },
    types::REGISTRY_SANCTIONS,
    ZKPassportRegistry,
};

global DAY: u64 = 86400;
global SANCTIONS_ROOT: Field = 0x5a5a;
global OLD_SANCTIONS_ROOT: Field = 0x5b5b;

// The registry with the fixture's roots and vk, and with `sanctions_roots` as (root, valid from)
// in publishing order, then the test contract. Time ends a day and a second after the proof's
// date, past the registry's delay and inside the proof's validity period.
unconstrained fn setup<let N: u32>(
    sanctions_roots: [(Field, u64); N],
) -> (TestEnvironment, AztecAddress) {
    let mut env = TestEnvironment::new();
    let _ =
        deploy_local_network_registry(&mut env, "@zkpassport_registry_contract/ZKPassportRegistry");
    seed_local_network_registry(
        &mut env,
        VerifierTest::CIRCUIT_VERSION,
        AGE_FIXTURE_CERT_ROOT,
        AGE_FIXTURE_CIRCUIT_ROOT,
        AGE_FIXTURE_VK_HASH,
        AGE_FIXTURE_CURRENT_DATE - 100,
    );

    let registry = ZKPassportRegistry::at(LOCAL_NETWORK_REGISTRY_ADDRESS);
    let mut current_root = 0;
    for i in 0..N {
        let (root, valid_from) = sanctions_roots[i];
        let _ = env.call_public(
            LOCAL_NETWORK_REGISTRY_OPERATOR,
            registry.update_root(REGISTRY_SANCTIONS, root, current_root, valid_from),
        );
        current_root = root;
    }

    env.mine_block_at(AGE_FIXTURE_CURRENT_DATE + DAY + 1);

    let verifier = env.deploy("VerifierTest").without_initializer();
    (env, verifier)
}

// The age fixture is a real outer_count_5 proof of {age(18, 0), bind}. Swapping its age commitment
// for another gives a proof of {that, bind} with the fixture's roots, date, vk and bound address.
fn fixture_with(commitment: Field) -> [Field; 583] {
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
    blob: Option<[Field; 583]>,
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
        env.call_private(sender, VerifierTest::at(verifier).verify_strict_sanctions(user)),
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

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_strict_sanctions(user));
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

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_strict_sanctions(user));
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
        env.call_private(sender, VerifierTest::at(verifier).verify_strict_sanctions(user)),
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

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_strict_sanctions(user));
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

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_strict_sanctions(user));
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

    let _ = env.call_private(sender, VerifierTest::at(verifier).verify_strict_sanctions(user));
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
        env.call_private(sender, VerifierTest::at(verifier).verify_sanctions(user)),
        SANCTIONS_ROOT,
    );
}
