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

// Deploys, seeds both registries and the accepted VK through the public API, then advances past
// the 24h DPM delay (+ mines a block, per the established Task 4/5 pattern) so every schedule is
// visible to a subsequent private read.
unconstrained fn seed(env: &mut TestEnvironment) -> crate::utils::Actors {
    let a = deploy_registry(env);
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, CERT_ROOT, 0, T0),
    );
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CIRCUIT, CIRC_ROOT, 0, T0),
    );
    let _ = env.call_public(a.admin, ZKPassportRegistry::at(a.registry).add_accepted_vk(VK_HASH));
    env.advance_next_block_timestamp_by(86401); // let all schedules land
    env.mine_block();
    a
}

#[test]
unconstrained fn valid_proof_context_passes() {
    let mut env = TestEnvironment::new();
    let a = seed(&mut env);
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(a.registry).assert_proof_valid(
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
    let a = seed(&mut env);
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(a.registry).assert_proof_valid(
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
    let a = seed(&mut env);
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(a.registry).assert_proof_valid(
            VK_HASH,
            0xbad,
            CIRC_ROOT,
            T0 + 100,
            0,
            0,
        ),
    );
}

// Deviates from the brief's sketch: the brief's version never accepted VK_HASH at all, so the
// call would have failed on "vk not accepted" before ever reaching the root check. Here the VK is
// accepted and its delay is allowed to land first; only *then* is the cert root scheduled, with no
// further time travel — so the VK check passes but the cert root's DPM slot still reads its
// zeroed (nonexistent) default, and the root check is what fails.
#[test(should_fail_with = "invalid certificate registry root")]
unconstrained fn seeded_root_invisible_before_delay() {
    let mut env = TestEnvironment::new();
    let a = deploy_registry(&mut env);
    let _ = env.call_public(a.admin, ZKPassportRegistry::at(a.registry).add_accepted_vk(VK_HASH));
    env.advance_next_block_timestamp_by(86401);
    env.mine_block(); // VK acceptance is now visible privately
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(REGISTRY_CERTIFICATE, CERT_ROOT, 0, T0),
    );
    // no further time travel — the cert root's DPM slot still reads its zeroed default
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(a.registry).assert_proof_valid(
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
    let a = seed(&mut env);
    let _ = env.call_public(
        a.admin,
        ZKPassportRegistry::at(a.registry).set_revocation_status(REGISTRY_CERTIFICATE, CERT_ROOT, true),
    );
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(a.registry).assert_proof_valid(
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
    let a = seed(&mut env);
    let _ = env.call_public(a.admin, ZKPassportRegistry::at(a.registry).set_oprf_pk_hash(0x0123));
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    // nullifier_type = 1 (SALTED) with the wrong oprf hash
    let _ = env.view_private(
        user,
        ZKPassportRegistry::at(a.registry).assert_proof_valid(
            VK_HASH,
            CERT_ROOT,
            CIRC_ROOT,
            T0 + 100,
            1,
            0x9999,
        ),
    );
}
