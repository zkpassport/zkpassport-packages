// TXE no-ops the recursion opcode, so these tests prove the wiring (capsules → parse → disclose
// commitment → policy → registry views → nullifier), NOT proof validity. Proof validity is
// covered by test-harness.
use crate::NationalityGate;
use aztec::{
    oracle::capsules,
    protocol::{address::AztecAddress, traits::FromField},
    test::helpers::test_environment::TestEnvironment,
};
use zkpassport::commitments::{age_commitment, disclose_commitment};
use zkpassport::constants::{PI_PARAMS_START, PROOF_FIELDS, VK_FIELDS};
use zkpassport::disclosed_data::{MRZ_DOC_TYPE_INDEX, TD3_NATIONALITY_INDEX};
use zkpassport::fixtures::proof::{
    AGE_FIXTURE_BIND_ADDRESS, AGE_FIXTURE_BLOB, AGE_FIXTURE_CERT_ROOT, AGE_FIXTURE_CIRCUIT_ROOT,
    AGE_FIXTURE_CURRENT_DATE, AGE_FIXTURE_VK_HASH,
};
use zkpassport_aztec_verifier::constants::{DISCLOSE_CAPSULE_SLOT, PROOF_CAPSULE_SLOT};
use zkpassport_registry_contract::{
    types::{MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT},
    ZKPassportRegistry,
};

// Must match NationalityGate's CIRCUIT_MANIFEST_VERSION (main.nr): packed("0.0.1").
global CIRCUIT_MANIFEST_VERSION: Field =
    0x0000000000010000000000000000000000000000000000000000000000000000;

pub struct Actors {
    pub registry: AztecAddress,
    pub admin: AztecAddress,
    pub operator: AztecAddress,
}

unconstrained fn deploy_registry(env: &mut TestEnvironment) -> Actors {
    let admin = env.create_light_account();
    let operator = env.create_light_account();
    let registry = env
        .deploy("@zkpassport_registry_contract/ZKPassportRegistry")
        .with_public_initializer(
            admin,
            ZKPassportRegistry::interface().constructor(
                admin,
                operator,
                MODE_VALID_WITHIN_WINDOW,
                86400,
            ),
        );
    Actors { registry, admin, operator }
}

// Seeds the registry with the age fixture's roots and vk, which the blobs below keep.
unconstrained fn seed_for_fixture(env: &mut TestEnvironment) -> AztecAddress {
    let deployed_registry = deploy_registry(env);
    let roots_valid_from = AGE_FIXTURE_CURRENT_DATE - 100;

    let _ = env.call_public(
        deployed_registry.operator,
        ZKPassportRegistry::at(deployed_registry.registry).update_root(
            REGISTRY_CERTIFICATE,
            AGE_FIXTURE_CERT_ROOT,
            0,
            roots_valid_from,
        ),
    );

    let _ = env.call_public(
        deployed_registry.operator,
        ZKPassportRegistry::at(deployed_registry.registry).update_root(
            REGISTRY_CIRCUIT,
            AGE_FIXTURE_CIRCUIT_ROOT,
            0,
            roots_valid_from,
        ),
    );

    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).add_accepted_vk(
            CIRCUIT_MANIFEST_VERSION,
            AGE_FIXTURE_VK_HASH,
        ),
    );

    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).set_version_status(
            CIRCUIT_MANIFEST_VERSION,
            true,
        ),
    );

    // The registry's 24h delay counts from TXE's start, real wall-clock time, and time only moves
    // forward. The fixture is dated 2050-01-01, so one jump lands every scheduled change and
    // keeps the proof inside the 7-day validity period.
    env.set_next_block_timestamp(AGE_FIXTURE_CURRENT_DATE + 86401);
    env.mine_block();

    env.deploy("NationalityGate").with_public_initializer(
        deployed_registry.admin,
        NationalityGate::interface().constructor(deployed_registry.registry),
    )
}

// A passport MRZ disclosing its document type ("P<") and nationality, nothing else
fn passport_disclosure(nationality: str<3>) -> ([bool; 90], [u8; 90]) {
    let mut mask = [false; 90];
    let mut bytes = [0 as u8; 90];
    for i in 0..2 {
        mask[MRZ_DOC_TYPE_INDEX + i] = true;
        bytes[MRZ_DOC_TYPE_INDEX + i] = "P<".as_bytes()[i];
    }
    for i in 0..3 {
        mask[TD3_NATIONALITY_INDEX + i] = true;
        bytes[TD3_NATIONALITY_INDEX + i] = nationality.as_bytes()[i];
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

// The age fixture is a real outer_count_5 proof with param commitments {age(18, 0), bind}.
// Swapping its age commitment for a disclose commitment gives a proof of {disclose, bind} with
// the fixture's roots, date, vk and bound address. Its proof bytes no longer match its public
// inputs, which these tests cannot notice: TXE does not run the recursion opcode.
fn disclose_blob(mask: [bool; 90], bytes: [u8; 90]) -> [Field; 583] {
    let mut blob = AGE_FIXTURE_BLOB;
    let params_start = VK_FIELDS + PROOF_FIELDS + PI_PARAMS_START;
    let mut swapped = 0;
    for i in params_start..params_start + 2 {
        if blob[i] == age_commitment(18, 0) {
            blob[i] = disclose_commitment(mask, bytes);
            swapped += 1;
        }
    }
    assert(swapped == 1, "age fixture has no age commitment to swap");
    blob
}

// The capsules are scoped to the account that will send the claim transaction, not to the
// address the proof is bound to.
unconstrained fn deliver_capsules(
    env: &mut TestEnvironment,
    gate: AztecAddress,
    sender: AztecAddress,
    blob: [Field; 583],
    payload: Option<[Field; 180]>,
) {
    env.utility_context_at(gate, |_| {
        capsules::store(gate, PROOF_CAPSULE_SLOT, blob, sender);
        if payload.is_some() {
            capsules::store(gate, DISCLOSE_CAPSULE_SLOT, payload.unwrap(), sender);
        }
    });
}

#[test]
unconstrained fn claim_succeeds_with_accepted_nationality() {
    let mut env = TestEnvironment::new();
    let gate = seed_for_fixture(&mut env);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let relayer = env.create_light_account();

    let (mask, bytes) = passport_disclosure("FRA");
    deliver_capsules(
        &mut env,
        gate,
        relayer,
        disclose_blob(mask, bytes),
        Option::some(disclose_payload(mask, bytes)),
    );

    assert(!env.view_public(NationalityGate::at(gate).has_badge(user)));
    let _ = env.call_private(relayer, NationalityGate::at(gate).claim(user));
    assert(env.view_public(NationalityGate::at(gate).has_badge(user)));
}

#[test(should_fail_with = "nationality not accepted")]
unconstrained fn claim_with_other_nationality_fails() {
    let mut env = TestEnvironment::new();
    let gate = seed_for_fixture(&mut env);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let relayer = env.create_light_account();

    let (mask, bytes) = passport_disclosure("DEU");
    deliver_capsules(
        &mut env,
        gate,
        relayer,
        disclose_blob(mask, bytes),
        Option::some(disclose_payload(mask, bytes)),
    );

    let _ = env.call_private(relayer, NationalityGate::at(gate).claim(user));
}

// The proof discloses DEU; the sender puts an FRA payload in the disclose capsule.
#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn claim_with_substituted_payload_fails() {
    let mut env = TestEnvironment::new();
    let gate = seed_for_fixture(&mut env);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let relayer = env.create_light_account();

    let (proved_mask, proved_bytes) = passport_disclosure("DEU");
    let (claimed_mask, claimed_bytes) = passport_disclosure("FRA");
    deliver_capsules(
        &mut env,
        gate,
        relayer,
        disclose_blob(proved_mask, proved_bytes),
        Option::some(disclose_payload(claimed_mask, claimed_bytes)),
    );

    let _ = env.call_private(relayer, NationalityGate::at(gate).claim(user));
}

#[test(should_fail_with = "param commitment mismatch")]
unconstrained fn claim_with_proof_without_disclose_fails() {
    let mut env = TestEnvironment::new();
    let gate = seed_for_fixture(&mut env);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let relayer = env.create_light_account();

    let (mask, bytes) = passport_disclosure("FRA");
    deliver_capsules(
        &mut env,
        gate,
        relayer,
        AGE_FIXTURE_BLOB,
        Option::some(disclose_payload(mask, bytes)),
    );

    let _ = env.call_private(relayer, NationalityGate::at(gate).claim(user));
}

#[test(should_fail_with = "missing disclose capsule")]
unconstrained fn claim_without_disclose_capsule_fails() {
    let mut env = TestEnvironment::new();
    let gate = seed_for_fixture(&mut env);
    let user = AztecAddress::from_field(AGE_FIXTURE_BIND_ADDRESS);
    let relayer = env.create_light_account();

    let (mask, bytes) = passport_disclosure("FRA");
    deliver_capsules(
        &mut env,
        gate,
        relayer,
        disclose_blob(mask, bytes),
        Option::none(),
    );

    let _ = env.call_private(relayer, NationalityGate::at(gate).claim(user));
}
