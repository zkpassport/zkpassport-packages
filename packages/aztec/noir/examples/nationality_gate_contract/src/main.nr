mod test;

use aztec::macros::aztec;

#[aztec]
pub contract NationalityGate {
    use aztec::{
        macros::{functions::{external, initializer, only_self, view}, storage::storage},
        protocol::{address::AztecAddress, traits::ToField},
        state_vars::{Map, PublicImmutable, PublicMutable},
    };
    use zkpassport_aztec_verifier::commitments::bind_user_address_commitment;
    use zkpassport_aztec_verifier::constants::NULLIFIER_TYPE_NON_SALTED;
    use zkpassport_aztec_verifier::disclosed_data::disclosed_nationality;
    use zkpassport_aztec_verifier::verify::{
        emit_uniqueness_nullifier, scope_hash, ServiceConfig, verify_zkpassport_proof_with_registry,
    };

    // The nationality the badge is for, as the MRZ writes it
    global NATIONALITY: str<3> = "FRA";

    // The domain this app's ZKPassport requests come from. The fixture proof was made for it.
    global DOMAIN: Field = scope_hash("example.com");

    // Circuit-manifest version this app accepts; must match the registry seeding (see test.nr).
    // This is packed("0.0.1"), the local/dev release the fixtures are built from.
    global CIRCUIT_MANIFEST_VERSION: Field =
        0x0000000000010000000000000000000000000000000000000000000000000000;

    #[storage]
    struct Storage<Context> {
        registry: PublicImmutable<AztecAddress, Context>,
        badges: Map<AztecAddress, PublicMutable<bool, Context>, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(registry: AztecAddress) {
        self.storage.registry.initialize(registry);
    }

    /// Claim the badge for `user`: verifies a ZKPassport proof (outer_count_5, param
    /// commitments = {disclose, bind(user)}) whose disclosed nationality is NATIONALITY, burns
    /// the unique identifier (one claim per passport) and grants `user` the public badge.
    ///
    /// The disclose payload rides in its own capsule, which verify_zkpassport_proof loads and
    /// checks against the proof. The proof must disclose the document type as well as the
    /// nationality: passports and ID cards keep the nationality at different MRZ offsets.
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
            disclose: true,
        };

        let expected = BoundedVec::from_array([bind_user_address_commitment(user.to_field())]);

        // The capsules ride in the sender's PXE, so they are scoped to the sender, who may be a
        // relayer, not `user`. The registry is a constructor argument so the tests can deploy
        // their own: on a network with a ZKPassport registry, verify_zkpassport_proof finds it.
        let verified = verify_zkpassport_proof_with_registry::<5>(
            self.context,
            registry,
            self.msg_sender(),
            config,
            expected,
        );

        let disclosure = verified.disclosure.unwrap();
        let nationality = disclosed_nationality(disclosure.mask, disclosure.bytes);
        assert(nationality.nationality == NATIONALITY.as_bytes(), "nationality not accepted");

        emit_uniqueness_nullifier(self.context, verified.unique_identifier);

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
