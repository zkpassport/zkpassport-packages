use aztec::macros::aztec;

/// Option D: the glue in its own contract, which apps call and which calls the registry itself.
#[aztec]
pub contract SubproofsVerifier {
    use aztec::{
        macros::functions::{external, view},
        protocol::address::AztecAddress,
    };
    use zkpassport_registry_standin_contract::RegistryStandIn;
    use zkpassport_subproofs::verify::{Verified, verify_zkpassport_subproofs};
    use zkpassport_subproofs_aztec::load_subproofs;

    #[external("private")]
    #[view]
    fn verify_5(registry: AztecAddress, scope: AztecAddress, version: Field, vk_hash: Field, domain: Field, expected: [Field; 2]) -> Field {
        let v = verify_zkpassport_subproofs(load_subproofs::<2, 11>(self.context, scope), domain, 0, false, expected);
        check_registry(self.context, registry, version, vk_hash, v)
    }

    #[external("private")]
    #[view]
    fn verify_7(registry: AztecAddress, scope: AztecAddress, version: Field, vk_hash: Field, domain: Field, expected: [Field; 4]) -> Field {
        let v = verify_zkpassport_subproofs(load_subproofs::<4, 13>(self.context, scope), domain, 0, false, expected);
        check_registry(self.context, registry, version, vk_hash, v)
    }

    #[contract_library_method]
    fn check_registry<let N: u32>(
        context: &mut aztec::context::PrivateContext,
        registry: AztecAddress,
        version: Field,
        vk_hash: Field,
        v: Verified<N>,
    ) -> Field {
        let p = v.public_inputs;
        RegistryStandIn::at(registry)
            .check(version, vk_hash, p.certificate_registry_root, p.circuit_registry_root, p.current_date, v.nullifier_type, p.oprf_pk_hash)
            .view(context);
        p.scoped_nullifier
    }
}
