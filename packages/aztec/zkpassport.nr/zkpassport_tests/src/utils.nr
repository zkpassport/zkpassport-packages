use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};
use zkpassport_registry_contract::{types::MODE_VALID_WITHIN_WINDOW, ZKPassportRegistry};

pub struct Actors {
    pub registry: AztecAddress,
    pub admin: AztecAddress,
    pub oracle: AztecAddress,
    pub guardian: AztecAddress,
}

pub unconstrained fn deploy_registry(env: &mut TestEnvironment) -> Actors {
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
