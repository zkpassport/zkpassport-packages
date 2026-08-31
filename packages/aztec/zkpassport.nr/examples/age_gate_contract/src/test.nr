// TXE no-ops the recursion opcode, so this test proves the WIRING (capsule → parse → policy →
// registry views → nullifier), NOT proof validity. Proof validity: Task 10 harness + Task 13 e2e.
use crate::AgeGate;
use aztec::{
    oracle::capsules, protocol::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};
use zkpassport_core::fixtures::proof::{
    AGE_FIXTURE_BLOB, AGE_FIXTURE_CERT_ROOT, AGE_FIXTURE_CIRCUIT_ROOT, AGE_FIXTURE_CURRENT_DATE,
    AGE_FIXTURE_VK_HASH,
};
use zkpassport_registry_contract::{
    types::{MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT},
    ZKPassportRegistry,
};

// Must match AgeGate's CIRCUIT_MANIFEST_VERSION (main.nr): packed("0.0.1"), the version the
// app passes to the registry.
global CIRCUIT_MANIFEST_VERSION: Field =
    0x0000000000010000000000000000000000000000000000000000000000000000;

pub struct Actors {
    pub registry: AztecAddress,
    pub admin: AztecAddress,
    pub oracle: AztecAddress,
    pub guardian: AztecAddress,
}

unconstrained fn deploy_registry(env: &mut TestEnvironment) -> Actors {
    let admin = env.create_light_account();
    let oracle = env.create_light_account();
    let guardian = env.create_light_account();
    let registry = env
        .deploy("@zkpassport_registry_contract/ZKPassportRegistry")
        .with_public_initializer(
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

unconstrained fn seed_for_fixture(env: &mut TestEnvironment) -> (Actors, AztecAddress) {
    let a = deploy_registry(env);
    let t = AGE_FIXTURE_CURRENT_DATE - 100; // roots valid from just before the proof date
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(
            REGISTRY_CERTIFICATE,
            AGE_FIXTURE_CERT_ROOT,
            0,
            t,
        ),
    );
    let _ = env.call_public(
        a.oracle,
        ZKPassportRegistry::at(a.registry).update_root(
            REGISTRY_CIRCUIT,
            AGE_FIXTURE_CIRCUIT_ROOT,
            0,
            t,
        ),
    );
    let _ = env.call_public(
        a.admin,
        ZKPassportRegistry::at(a.registry).add_accepted_vk(
            CIRCUIT_MANIFEST_VERSION,
            AGE_FIXTURE_VK_HASH,
        ),
    );
    let _ = env.call_public(
        a.admin,
        ZKPassportRegistry::at(a.registry).set_version_status(CIRCUIT_MANIFEST_VERSION, true),
    );

    // --- DPM landing + freshness anchor -------------------------------------------------------
    // The schedule_value_change calls just above run at TXE's session-start time, which is REAL
    // wall-clock "now" (call it T0) and can only move forward. The fixture is future-dated
    // (AGE_FIXTURE_CURRENT_DATE = 2050-01-01) precisely so one forward jump can satisfy both:
    //   - DPM landing: anchor_ts >= T0 + 86400 (the 24h delay counts from T0) — any 2050 target
    //     clears it;
    //   - freshness (zkpassport_aztec::verify::verify_zkpassport_proof):
    //       current_date <= anchor_ts + 3600   AND   current_date + 604800 > anchor_ts
    //     and anchor_ts = AGE_FIXTURE_CURRENT_DATE + 86401 sits well inside that 7-day window.
    // This is deterministic until real time reaches 2050 (set_next_block_timestamp cannot go
    // backward, so a wall-clock-dated fixture would instead expire ~6 days after generation).
    env.set_next_block_timestamp(AGE_FIXTURE_CURRENT_DATE + 86401);
    env.mine_block();
    // -------------------------------------------------------------------------------------------

    let age_gate = env.deploy("AgeGate").with_public_initializer(
        a.admin,
        AgeGate::interface().constructor(a.registry),
    );
    (a, age_gate)
}

unconstrained fn deliver_capsule(
    env: &mut TestEnvironment,
    age_gate: AztecAddress,
    user: AztecAddress,
) {
    env.utility_context_at(age_gate, |_| {
        capsules::store(
            age_gate,
            zkpassport_aztec::constants::PROOF_CAPSULE_SLOT,
            AGE_FIXTURE_BLOB,
            user,
        );
    });
}

#[test]
unconstrained fn claim_succeeds_with_fixture() {
    let mut env = TestEnvironment::new();
    let (_a, age_gate) = seed_for_fixture(&mut env);
    let user = env.create_light_account();
    deliver_capsule(&mut env, age_gate, user);
    let _ = env.call_private(user, AgeGate::at(age_gate).claim(user));
}

#[test(should_fail_with = "missing zkpassport proof capsule")]
unconstrained fn claim_without_capsule_fails() {
    let mut env = TestEnvironment::new();
    let (_a, age_gate) = seed_for_fixture(&mut env);
    let user = env.create_light_account();
    let _ = env.call_private(user, AgeGate::at(age_gate).claim(user));
}

#[test(should_fail_with = "invalid certificate registry root")]
unconstrained fn claim_fails_when_root_revoked() {
    let mut env = TestEnvironment::new();
    let (a, age_gate) = seed_for_fixture(&mut env);
    let _ = env.call_public(
        a.admin,
        ZKPassportRegistry::at(a.registry).set_revocation_status(
            REGISTRY_CERTIFICATE,
            AGE_FIXTURE_CERT_ROOT,
            true,
        ),
    );
    // advance_next_block_timestamp_by only sets the *next* block's timestamp target; a block must
    // actually be mined at that timestamp for the private call's anchor block to observe it (see
    // the identical pattern/comment in the registry contract's
    // test.nr::update_becomes_visible_after_delay).
    env.advance_next_block_timestamp_by(86401);
    env.mine_block();
    let user = env.create_light_account();
    deliver_capsule(&mut env, age_gate, user);
    let _ = env.call_private(user, AgeGate::at(age_gate).claim(user));
}

// Collision message text is kernel-owned (nullifier-already-exists check happens outside our
// asserts); mark should_fail rather than guessing should_fail_with, per the brief.
//
// Residual ambiguity: #[test(should_fail)] asserts over the WHOLE function body, not a specific
// statement, so this test alone can't distinguish "second claim rejected as intended" from "first
// claim failed for an unrelated reason, second never mattered". `claim_succeeds_with_fixture`
// (above) is the load-bearing guard that the first call_private below genuinely succeeds with this
// exact fixture/seed; read the two tests together.
#[test(should_fail)]
unconstrained fn second_claim_same_passport_fails() {
    let mut env = TestEnvironment::new();
    let (_a, age_gate) = seed_for_fixture(&mut env);
    let user = env.create_light_account();
    deliver_capsule(&mut env, age_gate, user);
    let _ = env.call_private(user, AgeGate::at(age_gate).claim(user));
    // Same fixture again → same scoped nullifier → tx must be rejected (nullifier collision).
    deliver_capsule(&mut env, age_gate, user);
    let _ = env.call_private(user, AgeGate::at(age_gate).claim(user));
}
