use crate::{
    types::{INITIAL_DELAY, MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT},
    ZKPassportRegistry,
};
use aztec::{
    oracle::get_contract_instance::get_contract_instance,
    protocol::{address::AztecAddress, contract_class_id::ContractClassId, traits::FromField},
    test::helpers::test_environment::TestEnvironment,
};

// Version id used across the tests. The contract treats it as an opaque nonzero Field; the
// production convention packs the ZKPassport circuit-manifest semver (2-byte BE major/minor/
// patch, left-aligned bytes32) — the same encoding the SDK sends L1's RootVerifier.
global CIRCUIT_MANIFEST_VERSION: Field = 1;

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let admin = env.create_light_account();
    let operator = env.create_light_account();
    let user = env.create_light_account();

    let registry_address = env.deploy("ZKPassportRegistry").with_public_initializer(
        admin,
        ZKPassportRegistry::interface().constructor(
            admin,
            operator,
            MODE_VALID_WITHIN_WINDOW,
            86400,
        ),
    );

    (env, registry_address, admin, operator, user)
}

// ---- Admin & pause ----

#[test(should_fail_with = "caller is not admin")]
unconstrained fn non_admin_cannot_transfer_admin() {
    let (env, registry_address, _, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.transfer_admin(operator));
}

#[test]
unconstrained fn operator_can_pause_admin_can_unpause() {
    let (env, registry_address, admin, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.pause());
    let _ = env.call_public(admin, registry.unpause());
}

#[test(should_fail_with = "caller is not admin or operator")]
unconstrained fn user_cannot_add_vk() {
    let (env, registry_address, _, _, user) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(user, registry.add_accepted_vk(CIRCUIT_MANIFEST_VERSION, 123));
}

#[test(should_fail_with = "caller is not admin or operator")]
unconstrained fn user_cannot_set_version_status() {
    let (env, registry_address, _, _, user) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(user, registry.set_version_status(CIRCUIT_MANIFEST_VERSION, true));
}

#[test(should_fail_with = "caller is not admin or operator")]
unconstrained fn user_cannot_pause() {
    let (env, registry_address, _, _, user) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(user, registry.pause());
}

#[test(should_fail_with = "caller is not admin")]
unconstrained fn operator_cannot_unpause() {
    let (env, registry_address, _, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.pause());
    let _ = env.call_public(operator, registry.unpause());
}

#[test(should_fail_with = "caller is not admin")]
unconstrained fn operator_cannot_set_operator() {
    let (env, registry_address, _, operator, user) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.set_operator(user));
}

#[test]
unconstrained fn operator_accepts_vk_and_enables_version_after_delay() {
    let (env, registry_address, _, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.add_accepted_vk(CIRCUIT_MANIFEST_VERSION, 123));
    let _ = env.call_public(operator, registry.set_version_status(CIRCUIT_MANIFEST_VERSION, true));
    let _ = env.call_public(operator, registry.set_oprf_pk_hash(456));

    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);
    assert(env.execute_utility(registry.is_vk_accepted(CIRCUIT_MANIFEST_VERSION, 123)));
    assert(env.execute_utility(registry.is_version_enabled(CIRCUIT_MANIFEST_VERSION)));
}

#[test]
unconstrained fn vk_add_visible_after_delay() {
    let (env, registry_address, admin, _, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(admin, registry.add_accepted_vk(CIRCUIT_MANIFEST_VERSION, 123));

    // Before the delay elapses: the DPM's *current* value is still false (zeroed default).
    assert(!env.execute_utility(registry.is_vk_accepted(CIRCUIT_MANIFEST_VERSION, 123)));

    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);
    assert(env.execute_utility(registry.is_vk_accepted(CIRCUIT_MANIFEST_VERSION, 123)));
}

// ---- Root updates ----

global ROOT_A: Field = 0xaaa1;
global ROOT_B: Field = 0xbbb2;

#[test(should_fail_with = "caller is not operator")]
unconstrained fn admin_cannot_update_root() {
    let (env, registry_address, admin, _, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(admin, registry.update_root(REGISTRY_CERTIFICATE, ROOT_A, 0, 1000));
}

#[test(should_fail_with = "current root mismatch")]
unconstrained fn cas_guard_bites() {
    let (env, registry_address, _, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.update_root(REGISTRY_CERTIFICATE, ROOT_A, 0, 1000));
    // second update must thread current_root = ROOT_A, not 0
    let _ = env.call_public(operator, registry.update_root(REGISTRY_CERTIFICATE, ROOT_B, 0, 2000));
}

#[test(should_fail_with = "root already exists")]
unconstrained fn roots_never_reinsertable() {
    let (env, registry_address, _, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.update_root(REGISTRY_CERTIFICATE, ROOT_A, 0, 1000));
    let _ =
        env.call_public(operator, registry.update_root(REGISTRY_CERTIFICATE, ROOT_B, ROOT_A, 2000));
    // ROOT_A again — must fail even though it is no longer latest
    let _ =
        env.call_public(operator, registry.update_root(REGISTRY_CERTIFICATE, ROOT_A, ROOT_B, 3000));
}

#[test(should_fail_with = "root does not exist")]
unconstrained fn cannot_revoke_unknown_root() {
    let (env, registry_address, admin, _, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ =
        env.call_public(admin, registry.set_revocation_status(REGISTRY_CERTIFICATE, ROOT_A, true));
}

#[test]
unconstrained fn update_becomes_visible_after_delay() {
    let (env, registry_address, _, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.update_root(REGISTRY_CERTIFICATE, ROOT_A, 0, 1000));

    // Before the delay elapses: the DPM's *current* value is still the zeroed default.
    let before = env.execute_utility(registry.get_latest_pair(REGISTRY_CERTIFICATE));
    assert_eq(before.latest, 0);
    assert_eq(before.previous, 0);

    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);
    let after = env.execute_utility(registry.get_latest_pair(REGISTRY_CERTIFICATE));
    assert_eq(after.latest, ROOT_A);
    assert_eq(after.previous, 0);
}

// ---- Private views (assert_proof_valid) ----

global CERT_ROOT: Field = 0xce571;
global CIRC_ROOT: Field = 0xc12c1;
global VK_HASH: Field = 0x7e57;
global T0: u64 = 1786900000;

unconstrained fn setup_and_seed() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress, AztecAddress) {
    let (env, registry_address, admin, operator, user) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.update_root(REGISTRY_CERTIFICATE, CERT_ROOT, 0, T0));
    let _ = env.call_public(operator, registry.update_root(REGISTRY_CIRCUIT, CIRC_ROOT, 0, T0));
    let _ = env.call_public(admin, registry.add_accepted_vk(CIRCUIT_MANIFEST_VERSION, VK_HASH));
    let _ = env.call_public(admin, registry.set_version_status(CIRCUIT_MANIFEST_VERSION, true));
    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);

    (env, registry_address, admin, operator, user)
}

#[test]
unconstrained fn valid_proof_context_passes() {
    let (env, registry_address, _, _, user) = setup_and_seed();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.view_private(
        user,
        registry.assert_proof_valid(
            CIRCUIT_MANIFEST_VERSION,
            VK_HASH,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            0,
            0,
        ),
    );
}

#[test(should_fail_with = "vk not accepted")]
unconstrained fn unknown_vk_rejected() {
    let (env, registry_address, _, _, user) = setup_and_seed();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.view_private(
        user,
        registry.assert_proof_valid(
            CIRCUIT_MANIFEST_VERSION,
            0xbad,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            0,
            0,
        ),
    );
}

#[test(should_fail_with = "invalid certificate registry root")]
unconstrained fn unknown_cert_root_rejected() {
    let (env, registry_address, _, _, user) = setup_and_seed();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.view_private(
        user,
        registry.assert_proof_valid(
            CIRCUIT_MANIFEST_VERSION,
            VK_HASH,
            0xbad,
            CIRC_ROOT,
            T0 + 100,
            0,
            0,
        ),
    );
}

#[test(should_fail_with = "invalid certificate registry root")]
unconstrained fn seeded_root_invisible_before_delay() {
    let (env, registry_address, admin, operator, user) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(admin, registry.add_accepted_vk(CIRCUIT_MANIFEST_VERSION, VK_HASH));
    let _ = env.call_public(admin, registry.set_version_status(CIRCUIT_MANIFEST_VERSION, true));

    // VK acceptance is now visible privately
    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);
    let _ = env.call_public(operator, registry.update_root(REGISTRY_CERTIFICATE, CERT_ROOT, 0, T0));

    // We expect this to fail because the CERT_ROOT has not yet become effective
    let _ = env.view_private(
        user,
        registry.assert_proof_valid(
            CIRCUIT_MANIFEST_VERSION,
            VK_HASH,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            0,
            0,
        ),
    );
}

#[test(should_fail_with = "invalid certificate registry root")]
unconstrained fn revoked_root_rejected_after_delay() {
    let (env, registry_address, admin, _, user) = setup_and_seed();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(
        admin,
        registry.set_revocation_status(REGISTRY_CERTIFICATE, CERT_ROOT, true),
    );
    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);

    let _ = env.view_private(
        user,
        registry.assert_proof_valid(
            CIRCUIT_MANIFEST_VERSION,
            VK_HASH,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            0,
            0,
        ),
    );
}

#[test(should_fail_with = "oprf pk hash mismatch")]
unconstrained fn salted_type_checks_oprf() {
    let (env, registry_address, admin, _, user) = setup_and_seed();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(admin, registry.set_oprf_pk_hash(0x0123));
    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);

    // nullifier_type = 1 (SALTED) with the wrong oprf hash
    let _ = env.view_private(
        user,
        registry.assert_proof_valid(
            CIRCUIT_MANIFEST_VERSION,
            VK_HASH,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            1,
            0x9999,
        ),
    );
}

#[test(should_fail_with = "version not enabled")]
unconstrained fn disabled_version_rejected() {
    let (env, registry_address, admin, _, user) = setup_and_seed();
    let registry = ZKPassportRegistry::at(registry_address);

    // Deprecate the whole release with one scheduled write.
    let _ = env.call_public(admin, registry.set_version_status(CIRCUIT_MANIFEST_VERSION, false));
    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);

    let _ = env.view_private(
        user,
        registry.assert_proof_valid(
            CIRCUIT_MANIFEST_VERSION,
            VK_HASH,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            0,
            0,
        ),
    );
}

#[test(should_fail_with = "vk not accepted")]
unconstrained fn vk_under_wrong_version_rejected() {
    let (env, registry_address, admin, _, user) = setup_and_seed();
    let registry = ZKPassportRegistry::at(registry_address);

    // Enable a second release that never accepted VK_HASH: acceptance must be version-scoped.
    let other_version = 2;
    let _ = env.call_public(admin, registry.set_version_status(other_version, true));
    env.mine_block_at(env.last_block_timestamp() + INITIAL_DELAY);

    let _ = env.view_private(
        user,
        registry.assert_proof_valid(other_version, VK_HASH, CERT_ROOT, CIRC_ROOT, T0 + 100, 0, 0),
    );
}

#[test(should_fail_with = "admin cannot be zero address")]
unconstrained fn constructor_rejects_zero_admin() {
    let mut env = TestEnvironment::new();
    let deployer = env.create_light_account();
    let operator = env.create_light_account();
    let _ = env.deploy("ZKPassportRegistry").with_public_initializer(
        deployer,
        ZKPassportRegistry::interface().constructor(
            AztecAddress::zero(),
            operator,
            MODE_VALID_WITHIN_WINDOW,
            86400,
        ),
    );
}

// ---- Contract updates ----

unconstrained fn registry_class_id(
    env: TestEnvironment,
    registry: AztecAddress,
) -> ContractClassId {
    env.utility_context(|_| get_contract_instance(registry).original_contract_class_id)
}

#[test(should_fail_with = "caller is not admin")]
unconstrained fn operator_cannot_update_the_contract() {
    let (env, registry_address, _, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.update_to(registry_class_id(env, registry_address)));
}

#[test(should_fail_with = "New contract class is not registered")]
unconstrained fn update_to_an_unregistered_class_fails() {
    let (env, registry_address, admin, _, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(admin, registry.update_to(ContractClassId::from_field(0xdead)));
}

#[test(should_fail_with = "caller is not admin")]
unconstrained fn operator_cannot_set_the_update_delay() {
    let (env, registry_address, _, operator, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(operator, registry.set_update_delay(7200));
}

#[test]
unconstrained fn admin_can_set_the_update_delay() {
    let (env, registry_address, admin, _, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(admin, registry.set_update_delay(7200));
}

#[test(should_fail_with = "New update delay is too low")]
unconstrained fn update_delay_below_the_protocol_minimum_fails() {
    let (env, registry_address, admin, _, _) = setup();
    let registry = ZKPassportRegistry::at(registry_address);

    let _ = env.call_public(admin, registry.set_update_delay(599));
}
