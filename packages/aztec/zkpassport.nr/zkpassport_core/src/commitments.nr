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
