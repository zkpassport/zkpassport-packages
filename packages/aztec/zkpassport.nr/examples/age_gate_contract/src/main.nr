mod test;

use aztec::macros::aztec;

#[aztec]
pub contract AgeGate {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        protocol::address::AztecAddress,
        state_vars::PublicImmutable,
    };
    use zkpassport_aztec::commitments::age_commitment;
    use zkpassport_aztec::verify::{
        emit_uniqueness_nullifier, ServiceConfig, verify_zkpassport_proof,
    };

    global MIN_AGE: u8 = 18;

    // Circuit-manifest version this app accepts; must match the registry seeding (see test.nr).
    // Convention: the CircuitManifest semver packed as 2-byte BE major/minor/patch, left-aligned
    // bytes32 (the SDK's L1 params.version encoding). This is packed("0.0.1") — the local/dev
    // release the fixtures are built from.
    global CIRCUIT_MANIFEST_VERSION: Field =
        0x0000000000010000000000000000000000000000000000000000000000000000;

    #[storage]
    struct Storage<Context> {
        registry: PublicImmutable<AztecAddress, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(registry: AztecAddress) {
        self.storage.registry.initialize(registry);
    }

    /// Claim the 18+ badge: verifies a ZKPassport age proof (outer_count_4, one param
    /// commitment = age(18, 0)) and burns the scoped nullifier — one claim per passport.
    ///
    /// WARNING (trust model, see README.md "Trust model" #6): `verify_zkpassport_proof` verifies
    /// the *proof*, not the *claimant* — a leaked capsule blob (`vk ‖ proof ‖ public_inputs`) is
    /// bearer authorization. The assert below only ties the capsule scope to this call's caller;
    /// it does NOT bind the proof itself. `claim` mints nothing of value (M1 scope), so this is
    /// sufficient here, but any app granting anything of value must additionally add
    /// `bind_user_address_commitment(user.to_field())` to `expected_commitments` and require the
    /// ZKPassport request to bind that address.
    #[external("private")]
    fn claim(user: AztecAddress) {
        assert(user == self.msg_sender(), "capsule scope must be the caller");
        let registry = self.storage.registry.read();
        let config = ServiceConfig {
            version: CIRCUIT_MANIFEST_VERSION,
            scope: 0, // fixture/demo: no domain binding; a real app pins sha256(domain) >> 8
            subscope: 0,
            validity_period: 7 * 86400,
            dev_mode: false,
        };
        let expected = [age_commitment(MIN_AGE, 0)];
        let verified = verify_zkpassport_proof::<4>(self.context, registry, user, config, expected);
        emit_uniqueness_nullifier(self.context, verified.scoped_nullifier);
    }
}
