mod test;

use aztec::macros::aztec;

#[aztec]
pub contract AgeGate {
    use aztec::{
        macros::{functions::{external, initializer, only_self, view}, storage::storage},
        protocol::{address::AztecAddress, traits::ToField},
        state_vars::{Map, PublicImmutable, PublicMutable},
    };
    use zkpassport_aztec_verifier::commitments::{age_commitment, bind_user_address_commitment};
    use zkpassport_aztec_verifier::constants::NULLIFIER_TYPE_NON_SALTED;
    use zkpassport_aztec_verifier::verify::{
        emit_uniqueness_nullifier, scope_hash, ServiceConfig, verify_zkpassport_proof_with_registry,
    };

    global MIN_AGE: u8 = 18;

    // The domain this app's ZKPassport requests come from. The fixture proof was made for it.
    global DOMAIN: Field = scope_hash("example.com");

    // Circuit-manifest version this app accepts; must match the registry seeding (see test.nr).
    // Convention: the CircuitManifest semver packed as 2-byte BE major/minor/patch, left-aligned
    // bytes32 (the SDK's L1 params.version encoding). This is packed("0.0.1") — the local/dev
    // release the fixtures are built from.
    global CIRCUIT_MANIFEST_VERSION: Field =
        0x0000000000010000000000000000000000000000000000000000000000000000;

    #[storage]
    struct Storage<Context> {
        registry: PublicImmutable<AztecAddress, Context>,
        // The 18+ badge: a public, soulbound flag per address. The passport proof that earns
        // it stays private; what becomes public is only that `user` holds the badge.
        badges: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(registry: AztecAddress) {
        self.storage.registry.initialize(registry);
    }

    /// Claim the 18+ badge for `user`: verifies a ZKPassport proof (outer_count_5, param
    /// commitments = {age(18, 0), bind(user)}), burns the unique identifier — one claim
    /// per passport — and grants `user` the public badge.
    ///
    /// The bind commitment ties the proof itself to `user` (the passport holder asked
    /// ZKPassport to bind that address when the proof was made).
    #[external("private")]
    fn claim(user: AztecAddress) {
        let registry = self.storage.registry.read();

        let config = ServiceConfig {
            version: CIRCUIT_MANIFEST_VERSION,
            domain: DOMAIN,
            scope: 0,
            unique_identifier_type: NULLIFIER_TYPE_NON_SALTED,
            validity_period: 7 * 86400,
            dev_mode: false,
            disclose: false,
        };

        let expected = BoundedVec::from_array([
            age_commitment(MIN_AGE, 0),
            bind_user_address_commitment(user.to_field()),
        ]);

        // The capsule rides in the sender's PXE, so it is scoped to the sender — who may be a
        // relayer, not `user`. The registry is a constructor argument so the tests can deploy
        // their own: on a network with a ZKPassport registry, verify_zkpassport_proof finds it.
        let verified = verify_zkpassport_proof_with_registry::<5>(
            self.context,
            registry,
            self.msg_sender(),
            config,
            expected,
        );

        // Make sure this can only be done once per passport
        emit_uniqueness_nullifier(self.context, verified.unique_identifier);

        // Deliberately public: the enqueued call reveals `user` in the transaction's public
        // phase. The badge is meant to be readable by anyone (other contracts included);
        // only the passport proof behind it is private.
        self.enqueue_self._grant_badge(user);
    }

    #[external("public")]
    #[only_self]
    fn _grant_badge(user: AztecAddress) {
        self.storage.badges.at(user).write(true);
    }

    #[external("public")]
    #[view]
    fn has_badge(user: AztecAddress) -> bool {
        self.storage.badges.at(user).read()
    }
}
