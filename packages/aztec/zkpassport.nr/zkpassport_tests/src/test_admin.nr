use crate::utils::deploy_registry;
use aztec::test::helpers::test_environment::TestEnvironment;
use zkpassport_registry_contract::ZKPassportRegistry;

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
        ZKPassportRegistry::at(actors.registry).add_accepted_vk(123),
    );
}

#[test]
unconstrained fn vk_add_visible_after_delay() {
    let mut env = TestEnvironment::new();
    let actors = deploy_registry(&mut env);
    let _ = env.call_public(
        actors.admin,
        ZKPassportRegistry::at(actors.registry).add_accepted_vk(123),
    );

    // Before the delay elapses: the DPM's *current* value is still false (zeroed default).
    let before = env.execute_utility(ZKPassportRegistry::at(actors.registry).is_vk_accepted(123));
    assert(!before);

    // After advancing past the 24h delay: the scheduled change is now the current value.
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let after = env.execute_utility(ZKPassportRegistry::at(actors.registry).is_vk_accepted(123));
    assert(after);
}
