//! A ZKPassport registry for tests, at the same address in TXE and on an Aztec local network.
//!
//! It is deployed universally (deployer zero) with default public keys, `DEV_REGISTRY_SALT` and
//! fixed constructor arguments. Its admin and operator are the local network's first two test
//! accounts, which TXE tests recreate from their secrets and partial addresses. Any change to the
//! registry's bytecode or to the Aztec toolchain moves `DEV_REGISTRY_ADDRESS`;
//! `ts/test/dev-registry.test.ts` recomputes it and these accounts from the compiled artifact.

use aztec::{
    protocol::{address::AztecAddress, hash::sha256_to_field},
    test::helpers::test_environment::{CreateAccountOptions, DeployOptions, TestEnvironment},
};
use zkpassport_registry_contract::{
    types::{MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT},
    ZKPassportRegistry,
};

/// The dev registry's address in TXE and on a local network.
pub global DEV_REGISTRY_ADDRESS: AztecAddress =
    AztecAddress { inner: 0x0a8d7ec68d16d4bdc05ff6dfd0ac0964392ac70c41c8c76bbc9ee605da0167cf };

/// The salt the dev registry is deployed with.
pub global DEV_REGISTRY_SALT: Field = sha256_to_field("ZKPASSPORT::AZTEC::DEV_REGISTRY".as_bytes());

/// The dev registry's root validity window, in seconds.
pub global DEV_REGISTRY_VALIDITY_WINDOW: u64 = 86400;

// The local network's test accounts 0 and 1 (@aztec-labs/accounts/testing), as secret and partial
// address: the dev registry's admin and operator.
global DEV_ADMIN_SECRET: Field = 0x2153536ff6628eee01cf4024889ff977a18d9fa61d0e414422f7681cf085c281;
global DEV_ADMIN_PARTIAL_ADDRESS: Field =
    0x0c3d18b7417dcc6605195a1f01287c43aa2c19eeec2e374975918174222199de;
global DEV_OPERATOR_SECRET: Field =
    0x0aebd1b4be76efa44f5ee655c20bf9ea60f7ae44b9a7fd1fd9f189c7a0b0cdae;
global DEV_OPERATOR_PARTIAL_ADDRESS: Field =
    0x0dc236cd93ad8e87fe632b8775774b9dd34ed6e9e084da5eadf05927c9ba5fd4;

pub struct DevRegistry {
    pub address: AztecAddress,
    pub admin: AztecAddress,
    pub operator: AztecAddress,
}

/// Deploys the dev registry in a TXE test, with its admin and operator.
///
/// `artifact_path` is the path `TestEnvironment::deploy` resolves to the compiled registry, e.g.
/// `"@zkpassport_registry_contract/ZKPassportRegistry"` from a workspace that has the registry as a
/// member. Use [`seed_dev_registry`] to register the roots and vk a test's proof needs.
pub unconstrained fn deploy_dev_registry<let N: u32>(
    env: &mut TestEnvironment,
    artifact_path: str<N>,
) -> DevRegistry {
    let admin = env.create_light_account_opts(CreateAccountOptions::new()
        .with_secret(DEV_ADMIN_SECRET)
        .with_partial_address(DEV_ADMIN_PARTIAL_ADDRESS));
    let operator = env.create_light_account_opts(CreateAccountOptions::new()
        .with_secret(DEV_OPERATOR_SECRET)
        .with_partial_address(DEV_OPERATOR_PARTIAL_ADDRESS));
    // Secret 0 gives the default public keys, as aztec.js deploys with; TXE derives keys from a
    // fresh secret otherwise.
    let address = env
        .deploy_opts(DeployOptions::new().with_salt(DEV_REGISTRY_SALT).with_secret(0), artifact_path
            )
        .with_public_initializer(
            admin,
            ZKPassportRegistry::interface().constructor(
                admin,
                operator,
                MODE_VALID_WITHIN_WINDOW,
                DEV_REGISTRY_VALIDITY_WINDOW,
            ),
        );
    assert(
        address == DEV_REGISTRY_ADDRESS,
        "the registry artifact does not deploy at DEV_REGISTRY_ADDRESS",
    );
    DevRegistry { address, admin, operator }
}

/// Registers a certificate root and a circuit root valid from `valid_from`, and accepts `vk_hash`
/// for circuit-manifest `version`.
///
/// The registry applies these after its delay: advance the test's time past it, and into the
/// freshness window of the proof being verified, before verifying.
pub unconstrained fn seed_dev_registry(
    env: &mut TestEnvironment,
    registry: DevRegistry,
    version: Field,
    certificate_root: Field,
    circuit_root: Field,
    vk_hash: Field,
    valid_from: u64,
) {
    let _ = env.call_public(
        registry.operator,
        ZKPassportRegistry::at(registry.address).update_root(
            REGISTRY_CERTIFICATE,
            certificate_root,
            0,
            valid_from,
        ),
    );
    let _ = env.call_public(
        registry.operator,
        ZKPassportRegistry::at(registry.address).update_root(
            REGISTRY_CIRCUIT,
            circuit_root,
            0,
            valid_from,
        ),
    );
    let _ = env.call_public(
        registry.admin,
        ZKPassportRegistry::at(registry.address).add_accepted_vk(version, vk_hash),
    );
    let _ = env.call_public(
        registry.admin,
        ZKPassportRegistry::at(registry.address).set_version_status(version, true),
    );
}

mod test {
    use crate::dev_registry::{deploy_dev_registry, DEV_REGISTRY_ADDRESS, seed_dev_registry};
    use crate::verify::default_registry;
    use aztec::{
        protocol::{address::AztecAddress, traits::FromField},
        test::helpers::test_environment::TestEnvironment,
    };
    use zkpassport::fixtures::proof::{
        AGE_FIXTURE_CERT_ROOT, AGE_FIXTURE_CIRCUIT_ROOT, AGE_FIXTURE_CURRENT_DATE,
        AGE_FIXTURE_VK_HASH,
    };
    use zkpassport_registry_contract::ZKPassportRegistry;

    global REGISTRY_ARTIFACT: str<48> = "@zkpassport_registry_contract/ZKPassportRegistry";

    #[test]
    unconstrained fn admin_and_operator_are_the_local_network_test_accounts() {
        let mut env = TestEnvironment::new();
        let registry = deploy_dev_registry(&mut env, REGISTRY_ARTIFACT);
        assert_eq(
            registry.admin,
            AztecAddress::from_field(
                0x0e900d357d0a7b9de3c0293c6b1a58dccfc1862f31c745ba5d3a5a5aaf4ac1fd,
            ),
        );
        assert_eq(
            registry.operator,
            AztecAddress::from_field(
                0x3029dfcca99e1f1fc1b9c88aa32de4eec686e79a0103a780ded503402aca3d08,
            ),
        );
    }

    #[test]
    unconstrained fn verify_finds_the_dev_registry_in_txe() {
        let mut env = TestEnvironment::new();
        let _ = deploy_dev_registry(&mut env, REGISTRY_ARTIFACT);
        env.private_context(|context| {
            assert_eq(
                default_registry(context.chain_id(), context.version()),
                DEV_REGISTRY_ADDRESS,
            );
        });
    }

    #[test]
    unconstrained fn seeded_dev_registry_accepts_the_vk_after_its_delay() {
        let mut env = TestEnvironment::new();
        let registry = deploy_dev_registry(&mut env, REGISTRY_ARTIFACT);
        seed_dev_registry(
            &mut env,
            registry,
            1,
            AGE_FIXTURE_CERT_ROOT,
            AGE_FIXTURE_CIRCUIT_ROOT,
            AGE_FIXTURE_VK_HASH,
            AGE_FIXTURE_CURRENT_DATE - 100,
        );
        env.set_next_block_timestamp(AGE_FIXTURE_CURRENT_DATE + 86401);
        env.mine_block();
        assert(env.execute_utility(ZKPassportRegistry::at(registry.address).is_vk_accepted(
            1,
            AGE_FIXTURE_VK_HASH,
        )));
    }
}
