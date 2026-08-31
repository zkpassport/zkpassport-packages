use compare_age_lib::calculate_param_commitment as age_param_commitment;
use disclose_lib::calculate_param_commitment as disclose_param_commitment;
use exclusion_check_sanctions_lib::param_commit::calculate_param_commitment as sanctions_param_commitment;
use utils::types::{DiscloseMask, MRZData};

/// age: Poseidon2([PROOF_TYPE_AGE, 2, min_age, max_age])
pub fn age_commitment(min_age: u8, max_age: u8) -> Field {
    age_param_commitment(min_age, max_age)
}

/// disclose: canonical circuits-lib commitment over (mask, masked bytes)
pub fn disclose_commitment(mask: DiscloseMask, disclosed: MRZData) -> Field {
    disclose_param_commitment(mask, disclosed)
}

/// sanctions record: Poseidon2([PROOF_TYPE_SANCTIONS_EXCLUSION, 2, root, is_strict])
pub fn sanctions_commitment(root: Field, is_strict: bool) -> Field {
    sanctions_param_commitment(root, is_strict)
}

mod test {
    use crate::commitments::{age_commitment, disclose_commitment};
    use crate::fixtures::{AGE_18_COMMITMENT, DISCLOSE_COMMITMENT};

    #[test]
    fn age_matches_conformance_anchor() {
        assert(age_commitment(18, 0) == AGE_18_COMMITMENT);
    }

    #[test]
    fn disclose_matches_conformance_anchor() {
        let mut mask = [false; 90];
        let mut bytes = [0 as u8; 90];
        mask[54] = true;
        mask[55] = true;
        mask[56] = true;
        bytes[54] = 65;
        bytes[55] = 85;
        bytes[56] = 83;
        assert(disclose_commitment(mask, bytes) == DISCLOSE_COMMITMENT);
    }
}
