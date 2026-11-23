use aztec::macros::aztec;

/// Paired functions for the spike: each query is verified once through the outer proof and once
/// through its subproofs, with the same policy, registry call and capsule mechanism, so the
/// verification itself is the only difference.
#[aztec]
pub contract SubproofsVerifierTest {
    use aztec::{
        context::PrivateContext,
        macros::functions::external,
        oracle::capsules,
        protocol::{address::AztecAddress, traits::ToField},
    };
    use zkpassport::commitments::{
        age_commitment, bind_user_address_commitment, disclose_commitment,
        nationality_inclusion_commitment,
    };
    use zkpassport::constants::{
        CURRENT_DATE_MAX_SKEW, DISCLOSE_CAPSULE_SLOT, PROOF_CAPSULE_SLOT, PROOF_FIELDS, VK_FIELDS,
    };
    use zkpassport_registry_contract::{
        local_network_registry::LOCAL_NETWORK_REGISTRY_ADDRESS, ZKPassportRegistry,
    };
    use zkpassport_registry_standin_contract::RegistryStandIn;
    use zkpassport_subproofs::verify::{verify_outer_proof, verify_zkpassport_subproofs, Verified};
    use zkpassport_subproofs_aztec::load_subproofs;
    use zkpassport_subproofs_verifier_contract::SubproofsVerifier;

    // packed("0.23.0")
    pub global CIRCUIT_VERSION: Field =
        0x0000001700000000000000000000000000000000000000000000000000000000;

    // The vk hashes 0.23.0 publishes for outer_count_5 and outer_count_7. The direct path names
    // them to the registry as the label of the glue it compiled in: the registry then vouches that
    // the version is enabled and that a proof of this many subproofs is accepted under it.
    pub global OUTER_COUNT_5_VK_HASH: Field =
        0x2a60f8b2f1448da91d2940877c0c16f3847cc8c1aca432372df0ee1a77c6ac96;
    pub global OUTER_COUNT_7_VK_HASH: Field =
        0x255634ed3e968811a52a80f600b7e54af522fdfe8afb1a08e7b391f48cd61e66;

    pub global DOMAIN: Field = 0x00a379a6f6eeafb9a55e378c118034e2751e682fab9f2d30ab13d2125586ce19; // example.com
    global VALIDITY_PERIOD: u64 = 7 * 86400;
    global VERIFICATION_METHOD_ICAO_CHIP: Field = 100;

    #[external("private")]
    fn verify_outer_5(user: AztecAddress) -> Field {
        let expected = [age_commitment(18, 0), bind_user_address_commitment(user.to_field())];
        let (verified, vk_hash) = load_and_verify_outer::<2, 11>(self.context, self.msg_sender(), expected);
        finish(self.context, verified, vk_hash)
    }

    #[external("private")]
    fn verify_direct_5(user: AztecAddress) -> Field {
        let expected = [age_commitment(18, 0), bind_user_address_commitment(user.to_field())];
        let verified = load_and_verify_subproofs::<2, 11>(self.context, self.msg_sender(), expected);
        finish(self.context, verified, OUTER_COUNT_5_VK_HASH)
    }

    #[external("private")]
    fn verify_outer_7(user: AztecAddress) -> Field {
        let expected = expected_7(self.context, self.msg_sender(), user);
        let (verified, vk_hash) = load_and_verify_outer::<4, 13>(self.context, self.msg_sender(), expected);
        finish(self.context, verified, vk_hash)
    }

    #[external("private")]
    fn verify_direct_7(user: AztecAddress) -> Field {
        let expected = expected_7(self.context, self.msg_sender(), user);
        let verified = load_and_verify_subproofs::<4, 13>(self.context, self.msg_sender(), expected);
        finish(self.context, verified, OUTER_COUNT_7_VK_HASH)
    }

    // The bench_* functions verify only (recursion and policy), with no registry call and no
    // freshness check, so they need no seeded registry. Both paths would make the same registry
    // call, so leaving it out does not change the difference between them.
    #[external("private")]
    fn bench_outer_5(user: AztecAddress) -> Field {
        let expected = [age_commitment(18, 0), bind_user_address_commitment(user.to_field())];
        let (verified, _) = load_and_verify_outer::<2, 11>(self.context, self.msg_sender(), expected);
        verified.public_inputs.scoped_nullifier
    }

    #[external("private")]
    fn bench_direct_5(user: AztecAddress) -> Field {
        let expected = [age_commitment(18, 0), bind_user_address_commitment(user.to_field())];
        load_and_verify_subproofs::<2, 11>(self.context, self.msg_sender(), expected)
            .public_inputs
            .scoped_nullifier
    }

    #[external("private")]
    fn bench_outer_7(user: AztecAddress) -> Field {
        let expected = expected_7(self.context, self.msg_sender(), user);
        let (verified, _) = load_and_verify_outer::<4, 13>(self.context, self.msg_sender(), expected);
        verified.public_inputs.scoped_nullifier
    }

    #[external("private")]
    fn bench_direct_7(user: AztecAddress) -> Field {
        let expected = expected_7(self.context, self.msg_sender(), user);
        load_and_verify_subproofs::<4, 13>(self.context, self.msg_sender(), expected)
            .public_inputs
            .scoped_nullifier
    }

    // The shape_* functions compare where the glue runs: in the app (A), in the registry (C) or in
    // its own contract (D). RegistryStandIn plays the registry with the same trivial checks in each,
    // so the shapes differ only in which contract runs the glue and how many calls that takes.
    #[external("private")]
    fn shape_app_5(user: AztecAddress, registry: AztecAddress) -> Field {
        let expected = [age_commitment(18, 0), bind_user_address_commitment(user.to_field())];
        let v = load_and_verify_subproofs::<2, 11>(self.context, self.msg_sender(), expected);
        let p = v.public_inputs;
        RegistryStandIn::at(registry)
            .check(CIRCUIT_VERSION, OUTER_COUNT_5_VK_HASH, p.certificate_registry_root, p.circuit_registry_root, p.current_date, v.nullifier_type, p.oprf_pk_hash)
            .view(self.context);
        p.scoped_nullifier
    }

    #[external("private")]
    fn shape_registry_5(user: AztecAddress, registry: AztecAddress) -> Field {
        let expected = [age_commitment(18, 0), bind_user_address_commitment(user.to_field())];
        RegistryStandIn::at(registry)
            .verify_5(self.msg_sender(), CIRCUIT_VERSION, OUTER_COUNT_5_VK_HASH, DOMAIN, expected)
            .view(self.context)
    }

    #[external("private")]
    fn shape_verifier_5(user: AztecAddress, verifier: AztecAddress, registry: AztecAddress) -> Field {
        let expected = [age_commitment(18, 0), bind_user_address_commitment(user.to_field())];
        SubproofsVerifier::at(verifier)
            .verify_5(registry, self.msg_sender(), CIRCUIT_VERSION, OUTER_COUNT_5_VK_HASH, DOMAIN, expected)
            .view(self.context)
    }

    #[external("private")]
    fn shape_app_7(user: AztecAddress, registry: AztecAddress) -> Field {
        let expected = expected_7(self.context, self.msg_sender(), user);
        let v = load_and_verify_subproofs::<4, 13>(self.context, self.msg_sender(), expected);
        let p = v.public_inputs;
        RegistryStandIn::at(registry)
            .check(CIRCUIT_VERSION, OUTER_COUNT_7_VK_HASH, p.certificate_registry_root, p.circuit_registry_root, p.current_date, v.nullifier_type, p.oprf_pk_hash)
            .view(self.context);
        p.scoped_nullifier
    }

    #[external("private")]
    fn shape_registry_7(user: AztecAddress, registry: AztecAddress) -> Field {
        let expected = expected_7(self.context, self.msg_sender(), user);
        RegistryStandIn::at(registry)
            .verify_7(self.msg_sender(), CIRCUIT_VERSION, OUTER_COUNT_7_VK_HASH, DOMAIN, expected)
            .view(self.context)
    }

    #[external("private")]
    fn shape_verifier_7(user: AztecAddress, verifier: AztecAddress, registry: AztecAddress) -> Field {
        let expected = expected_7(self.context, self.msg_sender(), user);
        SubproofsVerifier::at(verifier)
            .verify_7(registry, self.msg_sender(), CIRCUIT_VERSION, OUTER_COUNT_7_VK_HASH, DOMAIN, expected)
            .view(self.context)
    }

    // {age 18+, bind(user), disclose(mask, bytes from the disclose capsule), nationality in [AUS]}
    #[contract_library_method]
    fn expected_7(context: &mut PrivateContext, scope: AztecAddress, user: AztecAddress) -> [Field; 4] {
        // Safety: range-checked below; the disclose commitment binds it to the proof.
        let payload: Option<[Field; 180]> = unsafe {
            capsules::load(context.this_address(), DISCLOSE_CAPSULE_SLOT, scope)
        };
        assert(payload.is_some(), "missing disclose capsule");
        let payload = payload.unwrap();
        let mut mask = [false; 90];
        let mut bytes = [0 as u8; 90];
        for i in 0..90 {
            assert((payload[i] == 0) | (payload[i] == 1), "mask element not a bit");
            mask[i] = payload[i] == 1;
            bytes[i] = payload[90 + i] as u8;
            assert(bytes[i] as Field == payload[90 + i], "disclosed byte out of range");
        }
        [
            age_commitment(18, 0),
            bind_user_address_commitment(user.to_field()),
            disclose_commitment(mask, bytes),
            nationality_inclusion_commitment(["AUS"]),
        ]
    }

    #[contract_library_method]
    fn load_and_verify_outer<let N: u32, let L: u32>(
        context: &mut PrivateContext,
        scope: AztecAddress,
        expected: [Field; N],
    ) -> (Verified<N>, Field) {
        // Safety: verify_outer_proof constrains everything taken from it.
        let blob: Option<[Field; VK_FIELDS + PROOF_FIELDS + L]> = unsafe {
            capsules::load(context.this_address(), PROOF_CAPSULE_SLOT, scope)
        };
        assert(blob.is_some(), "missing zkpassport proof capsule");
        let blob = blob.unwrap();
        let mut vk = [0; VK_FIELDS];
        for i in 0..VK_FIELDS {
            vk[i] = blob[i];
        }
        let mut proof = [0; PROOF_FIELDS];
        for i in 0..PROOF_FIELDS {
            proof[i] = blob[VK_FIELDS + i];
        }
        let mut public_inputs = [0; L];
        for i in 0..L {
            public_inputs[i] = blob[VK_FIELDS + PROOF_FIELDS + i];
        }
        verify_outer_proof(vk, proof, public_inputs, DOMAIN, 0, false, expected)
    }

    #[contract_library_method]
    fn load_and_verify_subproofs<let N: u32, let L: u32>(
        context: &mut PrivateContext,
        scope: AztecAddress,
        expected: [Field; N],
    ) -> Verified<N> {
        verify_zkpassport_subproofs(load_subproofs::<N, L>(context, scope), DOMAIN, 0, false, expected)
    }

    // What verify_zkpassport_proof checks after the core: service policy, the verification method,
    // freshness and the registry.
    #[contract_library_method]
    fn finish<let N: u32>(
        context: &mut PrivateContext,
        verified: Verified<N>,
        registry_vk_hash: Field,
    ) -> Field {
        let pis = verified.public_inputs;
        assert(verified.nullifier_type == 0, "wrong unique identifier type");
        assert(
            pis.verification_method == VERIFICATION_METHOD_ICAO_CHIP,
            "wrong verification method",
        );
        let anchor_ts = context.get_anchor_block_header().timestamp();
        assert(pis.current_date <= anchor_ts + CURRENT_DATE_MAX_SKEW, "proof dated in the future");
        assert(pis.current_date + VALIDITY_PERIOD > anchor_ts, "proof too old");
        ZKPassportRegistry::at(LOCAL_NETWORK_REGISTRY_ADDRESS)
            .assert_proof_valid(
                CIRCUIT_VERSION,
                registry_vk_hash,
                pis.certificate_registry_root,
                pis.circuit_registry_root,
                pis.current_date,
                verified.nullifier_type,
                pis.oprf_pk_hash,
            )
            .view(context);
        pis.scoped_nullifier
    }
}
