use crate::{
    types::{MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT},
    ZKPassportRegistry,
};
use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

pub struct Actors {
    pub registry: AztecAddress,
    pub admin: AztecAddress,
    pub oracle: AztecAddress,
    pub guardian: AztecAddress,
}

// Circuit-release version id used across the tests (admin-chosen, any nonzero Field).
global VK_VERSION: Field = 1;

pub unconstrained fn deploy_registry(env: &mut TestEnvironment) -> Actors {
    let admin = env.create_light_account();
    let oracle = env.create_light_account();
    let guardian = env.create_light_account();
    let registry = env.deploy("ZKPassportRegistry").with_public_initializer(
        admin,
        ZKPassportRegistry::interface().constructor(
            admin,
            oracle,
            guardian,
            MODE_VALID_WITHIN_WINDOW,
            86400,
        ),
    );
    Actors { registry, admin, oracle, guardian }
}

// ---- Admin & pause ----

#[test(should_fail_with = "caller is not admin")]
unconstrained fn non_admin_cannot_transfer_admin() {
    let mut env = TestEnvironment::new();
    let actors = deploy_registry(&mut env);
    let _ = env.call_public(
        actors.oracle,
        ZKPassportRegistry::at(actors.registry).transfer_admin(actors.oracle),
    );
}

#[test]
unconstrained fn guardian_can_pause_admin_can_unpause() {
    let mut env = TestEnvironment::new();
    let actors = deploy_registry(&mut env);
    let _ = env.call_public(actors.guardian, ZKPassportRegistry::at(actors.registry).pause());
    let _ = env.call_public(actors.admin, ZKPassportRegistry::at(actors.registry).unpause());
}

#[test(should_fail_with = "caller is not admin")]
unconstrained fn guardian_cannot_unpause() {
    let mut env = TestEnvironment::new();
    let actors = deploy_registry(&mut env);
    let _ = env.call_public(actors.guardian, ZKPassportRegistry::at(actors.registry).pause());
    let _ = env.call_public(actors.guardian, ZKPassportRegistry::at(actors.registry).unpause());
}

#[test(should_fail_with = "caller is not admin")]
unconstrained fn non_admin_cannot_add_vk() {
    let mut env = TestEnvironment::new();
    let actors = deploy_registry(&mut env);
    let _ = env.call_public(
        actors.oracle,
        ZKPassportRegistry::at(actors.registry).add_accepted_vk(VK_VERSION, 123),
    );
}

#[test(should_fail_with = "caller is not admin")]
unconstrained fn non_admin_cannot_set_version_status() {
    let mut env = TestEnvironment::new();
    let actors = deploy_registry(&mut env);
    let _ = env.call_public(
        actors.oracle,
        ZKPassportRegistry::at(actors.registry).set_version_status(VK_VERSION, true),
    );
}

#[test]
unconstrained fn vk_add_visible_after_delay() {
    let mut env = TestEnvironment::new();
    let actors = deploy_registry(&mut env);
    let _ = env.call_public(
        actors.admin,
        ZKPassportRegistry::at(actors.registry).add_accepted_vk(VK_VERSION, 123),
    );

    // Before the delay elapses: the DPM's *current* value is still false (zeroed default).
    let before = env.execute_utility(ZKPassportRegistry::at(actors.registry).is_vk_accepted(
        VK_VERSION,
        123,
    ));
    assert(!before);

    // After advancing past the 24h delay: the scheduled change is now the current value.
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let after = env.execute_utility(ZKPassportRegistry::at(actors.registry).is_vk_accepted(
        VK_VERSION,
        123,
    ));
    assert(after);
}

// ---- Root updates ----

global ROOT_A: Field = 0xaaa1;
global ROOT_B: Field = 0xbbb2;

#[test(should_fail_with = "caller is not oracle")]
unconstrained fn admin_cannot_update_root() {
    let mut env = TestEnvironment::new();
    let a = deploy_registry(&mut env);
    let _ = env.call_public(
        a.admin,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, ROOT_A, 0, 1000),
    );
}

#[test(should_fail_with = "current root mismatch")]
unconstrained fn cas_guard_bites() {
    let mut env = TestEnvironment::new();
    let a = deploy_registry(&mut env);
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, ROOT_A, 0, 1000),
    );
    // second update must thread current_root = ROOT_A, not 0
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, ROOT_B, 0, 2000),
    );
}

#[test(should_fail_with = "root already exists")]
unconstrained fn roots_never_reinsertable() {
    let mut env = TestEnvironment::new();
    let a = deploy_registry(&mut env);
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, ROOT_A, 0, 1000),
    );
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, ROOT_B, ROOT_A, 2000),
    );
    // ROOT_A again — must fail even though it is no longer latest
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, ROOT_A, ROOT_B, 3000),
    );
}

#[test(should_fail_with = "root does not exist")]
unconstrained fn cannot_revoke_unknown_root() {
    let mut env = TestEnvironment::new();
    let a = deploy_registry(&mut env);
    let _ = env.call_public(
        a.admin,
        ZKPassportRegistry::at(a.registry).set_revocation_status(REGISTRY_CERTIFICATE, ROOT_A, true),
    );
}

#[test]
unconstrained fn update_becomes_visible_after_delay() {
    let mut env = TestEnvironment::new();
    let a = deploy_registry(&mut env);
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, ROOT_A, 0, 1000),
    );

    // Before the delay elapses: the DPM's *current* value is still the zeroed default.
    let before = env.execute_utility(ZKPassportRegistry::at(a.registry).get_latest_pair(
        REGISTRY_CERTIFICATE,
    ));
    assert_eq(before.latest, 0);
    assert_eq(before.previous, 0);

    // After advancing past the 24h delay: the scheduled change is now the current value.
    // advance_next_block_timestamp_by only sets the *next* block's timestamp target; a block
    // must actually be mined at that timestamp for a utility read to observe it (see
    // TestEnvironment::mine_block / mine_block_at in aztec-nr's test_environment.nr).
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let after = env.execute_utility(ZKPassportRegistry::at(a.registry).get_latest_pair(
        REGISTRY_CERTIFICATE,
    ));
    assert_eq(after.latest, ROOT_A);
    assert_eq(after.previous, 0);
}

// ---- Private views (assert_proof_valid) ----

global CERT_ROOT: Field = 0xce571;
global CIRC_ROOT: Field = 0xc12c1;
global VK_HASH: Field = 0x7e57;
global T0: u64 = 1786900000;

unconstrained fn seed(env: &mut TestEnvironment) -> Actors {
    let deployed_registry = deploy_registry(env);
    let _ = env.call_public(
        deployed_registry.oracle,
        ZKPassportRegistry::at(deployed_registry.registry).update_root(
            REGISTRY_CERTIFICATE,
            CERT_ROOT,
            0,
            T0,
        ),
    );
    let _ = env.call_public(
        deployed_registry.oracle,
        ZKPassportRegistry::at(deployed_registry.registry).update_root(
            REGISTRY_CIRCUIT,
            CIRC_ROOT,
            0,
            T0,
        ),
    );
    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).add_accepted_vk(VK_VERSION, VK_HASH),
    );
    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).set_version_status(VK_VERSION, true),
    );
    env.advance_next_block_timestamp_by(86401); // let all schedules land
    env.mine_block();
    deployed_registry
}

#[test]
unconstrained fn valid_proof_context_passes() {
    let mut env = TestEnvironment::new();
    let deployed_registry = seed(&mut env);
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            VK_VERSION,
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
    let mut env = TestEnvironment::new();
    let deployed_registry = seed(&mut env);
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            VK_VERSION,
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
    let mut env = TestEnvironment::new();
    let deployed_registry = seed(&mut env);
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            VK_VERSION,
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
    let mut env = TestEnvironment::new();
    let deployed_registry = deploy_registry(&mut env);
    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).add_accepted_vk(VK_VERSION, VK_HASH),
    );
    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).set_version_status(VK_VERSION, true),
    );

    // 24 hours later...
    env.advance_next_block_timestamp_by(86401);
    env.mine_block(); // VK acceptance is now visible privately
    let _ = env.call_public(
        deployed_registry.oracle,
        ZKPassportRegistry::at(deployed_registry.registry).update_root(
            REGISTRY_CERTIFICATE,
            CERT_ROOT,
            0,
            T0,
        ),
    );

    // We expect this to fail because the CERT_ROOT has not yet become effective
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            VK_VERSION,
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
    let mut env = TestEnvironment::new();
    let deployed_registry = seed(&mut env);
    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).set_revocation_status(
            REGISTRY_CERTIFICATE,
            CERT_ROOT,
            true,
        ),
    );
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            VK_VERSION,
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
    let mut env = TestEnvironment::new();
    let deployed_registry = seed(&mut env);
    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).set_oprf_pk_hash(0x0123),
    );
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    // nullifier_type = 1 (SALTED) with the wrong oprf hash
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            VK_VERSION,
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
    let mut env = TestEnvironment::new();
    let deployed_registry = seed(&mut env);
    // Deprecate the whole release with one scheduled write.
    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).set_version_status(VK_VERSION, false),
    );
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            VK_VERSION,
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
    let mut env = TestEnvironment::new();
    let deployed_registry = seed(&mut env);
    // Enable a second release that never accepted VK_HASH: acceptance must be version-scoped.
    let other_version = 2;
    let _ = env.call_public(
        deployed_registry.admin,
        ZKPassportRegistry::at(deployed_registry.registry).set_version_status(other_version, true),
    );
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            other_version,
            VK_HASH,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            0,
            0,
        ),
    );
}

#[test(should_fail_with = "guardian cannot be zero address")]
unconstrained fn set_guardian_rejects_zero_address() {
    let mut env = TestEnvironment::new();
    let actors = deploy_registry(&mut env);
    let _ = env.call_public(
        actors.admin,
        ZKPassportRegistry::at(actors.registry).set_guardian(AztecAddress::zero()),
    );
}

#[test(should_fail_with = "admin cannot be zero address")]
unconstrained fn constructor_rejects_zero_admin() {
    let mut env = TestEnvironment::new();
    let deployer = env.create_light_account();
    let oracle = env.create_light_account();
    let guardian = env.create_light_account();
    let _ = env.deploy("ZKPassportRegistry").with_public_initializer(
        deployer,
        ZKPassportRegistry::interface().constructor(
            AztecAddress::zero(),
            oracle,
            guardian,
            MODE_VALID_WITHIN_WINDOW,
            86400,
        ),
    );
}
