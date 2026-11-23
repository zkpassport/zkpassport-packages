// verify_zkpassport_subproofs over 7 real subproofs (3 base + 4 disclosures). Witness
// generation no-ops the recursion opcode, so bb prove + bb verify of this circuit is the signal.
use zkpassport_subproofs::{types::Subproofs, verify::verify_zkpassport_subproofs};

fn main(
    subproofs: Subproofs<4>,
    domain: pub Field,
    expected_commitments: pub [Field; 4],
) -> pub Field {
    let verified = verify_zkpassport_subproofs(subproofs, domain, 0, false, expected_commitments);
    verified.public_inputs.scoped_nullifier
}
