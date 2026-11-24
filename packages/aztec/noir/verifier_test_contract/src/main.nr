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
    use zkpassport_aztec_verifier::version::{circuit_version, MIN_SUPPORTED_CIRCUIT_VERSION};

    global SERVICE: ServiceConfig = ServiceConfig {
        min_version: MIN_SUPPORTED_CIRCUIT_VERSION,
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

    // An app that only accepts proofs from circuits 0.23.1 or later
    #[external("private")]
    fn verify_age_from_0_23_1(user: AztecAddress) -> Field {
        let config = ServiceConfig {
            min_version: circuit_version(0, 23, 1),
            domain: SERVICE.domain,
            scope: SERVICE.scope,
            unique_identifier_type: SERVICE.unique_identifier_type,
            validity_period: SERVICE.validity_period,
            dev_mode: SERVICE.dev_mode,
        };
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
