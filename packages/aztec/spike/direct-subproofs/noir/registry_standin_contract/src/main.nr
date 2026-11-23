use aztec::macros::aztec;

/// Stands in for ZKPassportRegistry when comparing where the glue runs. `check` takes what
/// `assert_proof_valid` takes but reads no storage, so every option pays the same registry cost;
/// `verify_5` and `verify_7` are option C, the glue inside the registry.
#[aztec]
pub contract RegistryStandIn {
    use aztec::{
        macros::functions::{external, view},
        protocol::address::AztecAddress,
    };
    use zkpassport_subproofs::verify::verify_zkpassport_subproofs;
    use zkpassport_subproofs_aztec::load_subproofs;

    #[external("private")]
    #[view]
    fn check(
        version: Field,
        vk_hash: Field,
        cert_root: Field,
        circuit_root: Field,
        current_date: u64,
        nullifier_type: u8,
        oprf_pk_hash: Field,
    ) {
        assert_set(version, vk_hash, cert_root, circuit_root, current_date, nullifier_type, oprf_pk_hash);
    }

    #[external("private")]
    #[view]
    fn verify_5(scope: AztecAddress, version: Field, vk_hash: Field, domain: Field, expected: [Field; 2]) -> Field {
        let v = verify_zkpassport_subproofs(load_subproofs::<2, 11>(self.context, scope), domain, 0, false, expected);
        let p = v.public_inputs;
        assert_set(version, vk_hash, p.certificate_registry_root, p.circuit_registry_root, p.current_date, v.nullifier_type, p.oprf_pk_hash);
        p.scoped_nullifier
    }

    #[external("private")]
    #[view]
    fn verify_7(scope: AztecAddress, version: Field, vk_hash: Field, domain: Field, expected: [Field; 4]) -> Field {
        let v = verify_zkpassport_subproofs(load_subproofs::<4, 13>(self.context, scope), domain, 0, false, expected);
        let p = v.public_inputs;
        assert_set(version, vk_hash, p.certificate_registry_root, p.circuit_registry_root, p.current_date, v.nullifier_type, p.oprf_pk_hash);
        p.scoped_nullifier
    }

    #[contract_library_method]
    fn assert_set(
        version: Field,
        vk_hash: Field,
        cert_root: Field,
        circuit_root: Field,
        current_date: u64,
        _nullifier_type: u8,
        _oprf_pk_hash: Field,
    ) {
        assert((version != 0) & (vk_hash != 0), "version and vk hash required");
        assert((cert_root != 0) & (circuit_root != 0) & (current_date != 0), "roots and date required");
    }
}
