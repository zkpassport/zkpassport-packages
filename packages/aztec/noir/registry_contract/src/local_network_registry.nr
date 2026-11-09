//! A ZKPassport registry for tests, at the same address in TXE and on an Aztec local network.
//!
//! Its purpose is to provide a stable registry address to write local network tests against.
//! It is deployed universally (deployer zero) with default public keys,
//! `LOCAL_NETWORK_REGISTRY_SALT` and fixed constructor arguments. Its admin and operator are the
//! local network's first two test accounts. Any change to the registry's bytecode or to the Aztec
//! toolchain moves `LOCAL_NETWORK_REGISTRY_ADDRESS`.

use crate::{
    types::{MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT},
    ZKPassportRegistry,
};
use aztec::{
    protocol::{address::AztecAddress, hash::sha256_to_field, traits::FromField},
    test::helpers::test_environment::{DeployOptions, TestEnvironment},
};

/// The local network registry's address in TXE and on a local network.
pub global LOCAL_NETWORK_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x18c3f5e2a35d875986926944ccb64a776097c3bf487e8f4a4a5812b5ad3f3eb9,
);

/// The local network registry's admin: the local network's test account 0.
pub global LOCAL_NETWORK_REGISTRY_ADMIN: AztecAddress = AztecAddress::from_field(
    0x0e900d357d0a7b9de3c0293c6b1a58dccfc1862f31c745ba5d3a5a5aaf4ac1fd,
);

/// The local network registry's operator: the local network's test account 1.
pub global LOCAL_NETWORK_REGISTRY_OPERATOR: AztecAddress = AztecAddress::from_field(
    0x3029dfcca99e1f1fc1b9c88aa32de4eec686e79a0103a780ded503402aca3d08,
);

/// The salt the local network registry is deployed with.
pub global LOCAL_NETWORK_REGISTRY_SALT: Field =
    sha256_to_field("ZKPASSPORT::AZTEC::LOCAL_NETWORK_REGISTRY".as_bytes());

/// The local network registry's root validity window, in seconds.
pub global LOCAL_NETWORK_REGISTRY_VALIDITY_WINDOW: u64 = 86400;

/// Deploys the local network registry in a TXE test and returns its address,
/// `LOCAL_NETWORK_REGISTRY_ADDRESS`.
///
/// `artifact_path` is the path `TestEnvironment::deploy` resolves to the compiled registry, e.g.
/// `"@zkpassport_registry_contract/ZKPassportRegistry"` from a workspace that has the registry as a
/// member. Use [`seed_local_network_registry`] to register the roots and vk a test's proof needs.
pub unconstrained fn deploy_local_network_registry<let N: u32>(
    env: &mut TestEnvironment,
    artifact_path: str<N>,
) -> AztecAddress {
    let address = env
        .deploy_opts(
            DeployOptions::new().with_salt(LOCAL_NETWORK_REGISTRY_SALT).with_secret(0),
            artifact_path,
        )
        .with_public_initializer(
            LOCAL_NETWORK_REGISTRY_ADMIN,
            ZKPassportRegistry::interface().constructor(
                LOCAL_NETWORK_REGISTRY_ADMIN,
                LOCAL_NETWORK_REGISTRY_OPERATOR,
                MODE_VALID_WITHIN_WINDOW,
                LOCAL_NETWORK_REGISTRY_VALIDITY_WINDOW,
            ),
        );
    assert(
        address == LOCAL_NETWORK_REGISTRY_ADDRESS,
        "the registry artifact does not deploy at LOCAL_NETWORK_REGISTRY_ADDRESS",
    );
    address
}

/// Registers a certificate root and a circuit root valid from `valid_from` in the local network
/// registry, and accepts `vk_hash` for circuit-manifest `version`.
///
/// The registry applies these after its delay: advance the test's time past it, and into the
/// freshness window of the proof being verified, before verifying.
pub unconstrained fn seed_local_network_registry(
    env: &mut TestEnvironment,
    version: Field,
    certificate_root: Field,
    circuit_root: Field,
    vk_hash: Field,
    valid_from: u64,
) {
    let registry = ZKPassportRegistry::at(LOCAL_NETWORK_REGISTRY_ADDRESS);
    let _ = env.call_public(
        LOCAL_NETWORK_REGISTRY_OPERATOR,
        registry.update_root(REGISTRY_CERTIFICATE, certificate_root, 0, valid_from),
    );
    let _ = env.call_public(
        LOCAL_NETWORK_REGISTRY_OPERATOR,
        registry.update_root(REGISTRY_CIRCUIT, circuit_root, 0, valid_from),
    );
    let _ =
        env.call_public(LOCAL_NETWORK_REGISTRY_ADMIN, registry.add_accepted_vk(version, vk_hash));
    let _ =
        env.call_public(LOCAL_NETWORK_REGISTRY_ADMIN, registry.set_version_status(version, true));
}
