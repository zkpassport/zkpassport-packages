mod test;

use aztec::macros::aztec;

/// Verifies the age fixture's proof, with its commitments swapped as each test needs, through one
/// function per kind of query. Only the workspace's TXE tests use it.
#[aztec]
pub contract VerifierTest {
    use aztec::{macros::functions::external, protocol::address::AztecAddress};
    use zkpassport_aztec_verifier::constants::NULLIFIER_TYPE_SALTED;
    use zkpassport_aztec_verifier::query::Query;
    use zkpassport_aztec_verifier::verify::{
        ServiceConfig, verify_zkpassport_proof, verify_zkpassport_proof_for_user,
    };
    use zkpassport_aztec_verifier::version::circuit_version;

    global SERVICE: ServiceConfig = ServiceConfig::new("example.com");

    // An app that requires salted unique identifiers, which the ZKPassport SDK only makes with a
    // strict face match
    global SALTED_SERVICE: ServiceConfig =
        ServiceConfig::new("example.com").unique_identifier_type(NULLIFIER_TYPE_SALTED);

    #[external("private")]
    fn verify_age(user: AztecAddress) -> Field {
        let query = Query::new().age_min(18).bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query).unique_identifier
    }

    #[external("private")]
    fn verify_age_for_user(user: AztecAddress) -> Field {
        let query = Query::new().age_min(18);
        verify_zkpassport_proof_for_user(self.context, self.msg_sender(), user, SERVICE, query)
            .unique_identifier
    }

    // An app that only accepts proofs from circuits 0.23.1 or later
    #[external("private")]
    fn verify_age_from_0_23_1(user: AztecAddress) -> Field {
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

    // The unique identifier, and the commitment of the face match the proof returns
    #[external("private")]
    fn verify_salted_strict_face_match(user: AztecAddress) -> [Field; 2] {
        let query = Query::new().strict_face_match().bind_user_address(user);
        let verified =
            verify_zkpassport_proof(self.context, self.msg_sender(), SALTED_SERVICE, query);
        [verified.unique_identifier, verified.face_match.unwrap().commitment()]
    }

    #[external("private")]
    fn verify_face_match(user: AztecAddress) -> Field {
        let query = Query::new().face_match().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query)
            .face_match
            .unwrap()
            .commitment()
    }

    #[external("private")]
    fn verify_non_strict_sanctions(user: AztecAddress) -> Field {
        let query = Query::new().non_strict_sanctions().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query)
            .sanctions_root
            .unwrap()
    }
}
