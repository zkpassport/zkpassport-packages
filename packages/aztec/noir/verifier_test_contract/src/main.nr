mod test;

use aztec::macros::aztec;

/// Verifies the age fixture's proof, with its commitments swapped as each test needs, through one
/// function per kind of query. Only the workspace's TXE tests use it.
#[aztec]
pub contract VerifierTest {
    use aztec::{macros::functions::external, protocol::address::AztecAddress};
    use zkpassport_aztec_verifier::query::Query;
    use zkpassport_aztec_verifier::verify::{
        emit_custom_uniqueness_nullifier, emit_uniqueness_nullifier, ServiceConfig,
        UniqueIdentifier, verify_zkpassport_proof, verify_zkpassport_proof_for_user,
    };
    use zkpassport_aztec_verifier::version::circuit_version;

    global SERVICE: ServiceConfig = ServiceConfig::new("example.com");

    global CLAIM_DOMAIN: Field = 0xc1a1;

    #[external("private")]
    fn verify_age(user: AztecAddress) -> UniqueIdentifier {
        let query = Query::new().age_min(18).bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query).unique_identifier
    }

    // As a verifier contract an app calls: the capsules are delivered to this contract under the
    // scope the app passes, since the app is this call's msg_sender
    #[external("private")]
    fn verify_age_for(capsule_scope: AztecAddress, user: AztecAddress) -> UniqueIdentifier {
        let query = Query::new().age_min(18);
        verify_zkpassport_proof_for_user(self.context, capsule_scope, user, SERVICE, query)
            .unique_identifier
    }

    #[external("private")]
    fn claim_age(user: AztecAddress) {
        let query = Query::new().age_min(18);
        let verified =
            verify_zkpassport_proof_for_user(self.context, self.msg_sender(), user, SERVICE, query);
        emit_uniqueness_nullifier(self.context, verified.unique_identifier);
    }

    #[external("private")]
    fn claim_age_with_component(user: AztecAddress, component: Field) {
        let query = Query::new().age_min(18);
        let verified =
            verify_zkpassport_proof_for_user(self.context, self.msg_sender(), user, SERVICE, query);
        emit_custom_uniqueness_nullifier(
            self.context,
            verified.unique_identifier,
            [CLAIM_DOMAIN, component],
        );
    }

    #[external("private")]
    fn claim_age_with_component_through_a_verifier(user: AztecAddress, component: Field) {
        let unique_identifier =
            self.call(VerifierTest::at(self.address).verify_age_for(self.msg_sender(), user));
        emit_custom_uniqueness_nullifier(
            self.context,
            unique_identifier,
            [CLAIM_DOMAIN, component],
        );
    }

    #[external("private")]
    fn verify_age_for_user(user: AztecAddress) -> UniqueIdentifier {
        let query = Query::new().age_min(18);
        verify_zkpassport_proof_for_user(self.context, self.msg_sender(), user, SERVICE, query)
            .unique_identifier
    }

    // An app that only accepts proofs from circuits 0.23.1 or later
    #[external("private")]
    fn verify_age_from_0_23_1(user: AztecAddress) -> UniqueIdentifier {
        let config = SERVICE.min_version(circuit_version(0, 23, 1));
        let query = Query::new().age_min(18).bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), config, query).unique_identifier
    }

    #[external("private")]
    fn verify_nationality(user: AztecAddress) -> [u8; 3] {
        let query = Query::new().disclose_nationality().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query).nationality()
    }

    #[external("private")]
    fn verify_full_name(user: AztecAddress) -> [u8; 39] {
        let query = Query::new().disclose_full_name().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query).name().storage()
    }

    #[external("private")]
    fn verify_sanctions(user: AztecAddress) -> Field {
        let query = Query::new().sanctions().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query)
            .sanctions_root
            .unwrap()
    }

    #[external("private")]
    fn verify_strict_sanctions(user: AztecAddress) -> Field {
        let query = Query::new().strict_sanctions().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query)
            .sanctions_root
            .unwrap()
    }
}
