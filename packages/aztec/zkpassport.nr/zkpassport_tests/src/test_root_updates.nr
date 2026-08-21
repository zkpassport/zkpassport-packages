use crate::utils::deploy_registry;
use aztec::test::helpers::test_environment::TestEnvironment;
use zkpassport_registry_contract::{types::REGISTRY_CERTIFICATE, ZKPassportRegistry};

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
