mod test;

use aztec::macros::aztec;

#[aztec]
pub contract AgeGate {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        protocol::{address::AztecAddress, traits::ToField},
        state_vars::PublicImmutable,
    };
    use zkpassport_aztec::commitments::{age_commitment, bind_user_address_commitment};
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

    /// Claim the 18+ badge for `user`: verifies a ZKPassport proof (outer_count_5, param
    /// commitments = {age(18, 0), bind(user)}) and burns the scoped nullifier — one claim
    /// per passport.
    ///
    /// The bind commitment ties the proof itself to `user` (the passport holder asked
    /// ZKPassport to bind that address when the proof was made), so a leaked capsule blob
    /// authorizes nothing for anyone else, and anyone — a relayer included — may submit the
    /// transaction; no `msg_sender` check is needed.
    #[external("private")]
    fn claim(user: AztecAddress) {
        let registry = self.storage.registry.read();
        let config = ServiceConfig {
            version: CIRCUIT_MANIFEST_VERSION,
            scope: 0, // fixture/demo: no domain binding; a real app pins sha256(domain) >> 8
            subscope: 0,
            validity_period: 7 * 86400,
            dev_mode: false,
        };
        let expected = [age_commitment(MIN_AGE, 0), bind_user_address_commitment(user.to_field())];
        // The capsule rides in the sender's PXE, so it is scoped to the sender — who may be a
        // relayer, not `user`.
        let verified = verify_zkpassport_proof::<5>(
            self.context,
            registry,
            self.msg_sender(),
            config,
            expected,
        );
        emit_uniqueness_nullifier(self.context, verified.scoped_nullifier);
    }
}
