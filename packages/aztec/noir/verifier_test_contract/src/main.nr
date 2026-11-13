mod test;

use aztec::macros::aztec;

/// Verifies the age fixture's proof, with its commitments swapped as each test needs, through one
/// function per kind of query. Only the workspace's TXE tests use it.
#[aztec]
pub contract VerifierTest {
    use aztec::{macros::functions::external, protocol::address::AztecAddress};
    use zkpassport_aztec_verifier::constants::NULLIFIER_TYPE_NON_SALTED;
    use zkpassport_aztec_verifier::query::Query;
    use zkpassport_aztec_verifier::verify::{scope_hash, ServiceConfig, verify_zkpassport_proof};

    // packed("0.22.0"), the circuits release the age fixture was proved with
    pub global CIRCUIT_VERSION: Field =
        0x0000001600000000000000000000000000000000000000000000000000000000;

    global SERVICE: ServiceConfig = ServiceConfig {
        version: CIRCUIT_VERSION,
        domain: scope_hash("example.com"),
        scope: 0,
        unique_identifier_type: NULLIFIER_TYPE_NON_SALTED,
        validity_period: 7 * 86400,
        dev_mode: false,
    };

    #[external("private")]
    fn verify_age(user: AztecAddress) -> Field {
        let query = Query::new().age_min(18).bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query).unique_identifier
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
    fn verify_face_match(user: AztecAddress) -> Field {
        let query = Query::new().face_match().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query)
            .face_match
            .unwrap()
            .app_id_hash
    }

    #[external("private")]
    fn verify_strict_face_match(user: AztecAddress) -> Field {
        let query = Query::new().strict_face_match().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query)
            .face_match
            .unwrap()
            .app_id_hash
    }

    #[external("private")]
    fn verify_strict_sanctions(user: AztecAddress) -> Field {
        let query = Query::new().strict_sanctions().bind_user_address(user);
        verify_zkpassport_proof(self.context, self.msg_sender(), SERVICE, query)
            .sanctions_root
            .unwrap()
    }
}
