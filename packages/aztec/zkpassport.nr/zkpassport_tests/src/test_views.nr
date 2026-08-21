use crate::utils::deploy_registry;
use aztec::test::helpers::test_environment::TestEnvironment;
use zkpassport_registry_contract::{
    types::{REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT},
    ZKPassportRegistry,
};

global CERT_ROOT: Field = 0xce571;
global CIRC_ROOT: Field = 0xc12c1;
global VK_HASH: Field = 0x7e57;
global T0: u64 = 1786900000;

unconstrained fn seed(env: &mut TestEnvironment) -> crate::utils::Actors {
    let deployed_registry = deploy_registry(env);
    let _ = env.call_public(
        deployed_registry.oracle,
        ZKPassportRegistry::at(deployed_registry.registry).update_root(REGISTRY_CERTIFICATE, CERT_ROOT, 0, T0),
    );
    let _ = env.call_public(
        deployed_registry.oracle,
        ZKPassportRegistry::at(deployed_registry.registry).update_root(REGISTRY_CIRCUIT, CIRC_ROOT, 0, T0),
    );
    let _ = env.call_public(deployed_registry.admin, ZKPassportRegistry::at(deployed_registry.registry).add_accepted_vk(VK_HASH));
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
    let _ = env.call_public(deployed_registry.admin, ZKPassportRegistry::at(deployed_registry.registry).add_accepted_vk(VK_HASH));

    // 24 hours later...
    env.advance_next_block_timestamp_by(86401);
    env.mine_block(); // VK acceptance is now visible privately
    let _ = env.call_public(
        deployed_registry.oracle,
        ZKPassportRegistry::at(deployed_registry.registry).update_root(REGISTRY_CERTIFICATE, CERT_ROOT, 0, T0),
    );

    // We expect this to fail because the CERT_ROOT has not yet become effective
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
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
        ZKPassportRegistry::at(deployed_registry.registry).set_revocation_status(REGISTRY_CERTIFICATE, CERT_ROOT, true),
    );
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
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
    let _ = env.call_public(deployed_registry.admin, ZKPassportRegistry::at(deployed_registry.registry).set_oprf_pk_hash(0x0123));
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    // nullifier_type = 1 (SALTED) with the wrong oprf hash
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(deployed_registry.registry).assert_proof_valid(
            VK_HASH,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            1,
            0x9999,
        ),
    );
}
