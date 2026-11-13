//! The age fixture for TXE tests. A bind covers the network a contract runs on, and TXE runs as
//! rollup version 1, not the network the fixture was proved for. TXE doesn't verify the recursion,
//! so a fixture bound to TXE's network only needs its bind commitment swapped.

use crate::commitments::bind_commitment;
use crate::constants::{PI_PARAMS_START, PROOF_FIELDS, VK_FIELDS};
use crate::fixtures::proof::{AGE_FIXTURE_BIND_ADDRESS, AGE_FIXTURE_BIND_CHAIN_ID, AGE_FIXTURE_BLOB};

/// The rollup version a contract reads from its context in TXE, its network's chain id.
pub global TXE_CHAIN_ID: Field = 1;

/// AGE_FIXTURE_BLOB bound to AGE_FIXTURE_BIND_ADDRESS on TXE's network.
pub fn age_fixture_blob_for_txe() -> [Field; 583] {
    let fixture_bind = bind_commitment(AGE_FIXTURE_BIND_ADDRESS, AGE_FIXTURE_BIND_CHAIN_ID);
    let txe_bind = bind_commitment(AGE_FIXTURE_BIND_ADDRESS, TXE_CHAIN_ID);

    let mut blob = AGE_FIXTURE_BLOB;
    let mut swapped = false;
    let params_start = VK_FIELDS + PROOF_FIELDS + PI_PARAMS_START;
    for i in params_start..params_start + 2 {
        if blob[i] == fixture_bind {
            blob[i] = txe_bind;
            swapped = true;
        }
    }

    assert(swapped, "the age fixture has no bind commitment over its own network");
    blob
}

mod test {
    use crate::commitments::bind_commitment;
    use crate::constants::{PI_PARAMS_START, PROOF_FIELDS, VK_FIELDS};
    use crate::fixtures::proof::{AGE_FIXTURE_BIND_ADDRESS, AGE_FIXTURE_BLOB};
    use super::{age_fixture_blob_for_txe, TXE_CHAIN_ID};

    #[test]
    fn swaps_only_the_bind_commitment() {
        let blob = age_fixture_blob_for_txe();
        let params_start = VK_FIELDS + PROOF_FIELDS + PI_PARAMS_START;
        let txe_bind = bind_commitment(AGE_FIXTURE_BIND_ADDRESS, TXE_CHAIN_ID);

        let mut changed = 0;
        for i in 0..583 {
            if blob[i] != AGE_FIXTURE_BLOB[i] {
                assert((i >= params_start) & (i < params_start + 2));
                assert_eq(blob[i], txe_bind);
                changed += 1;
            }
        }
        assert_eq(changed, 1);
    }
}
