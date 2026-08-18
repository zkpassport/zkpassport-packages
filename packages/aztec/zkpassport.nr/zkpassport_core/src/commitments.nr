use compare_age_lib::calculate_param_commitment as age_param_commitment;
use disclose_lib::calculate_param_commitment as disclose_param_commitment;
use bind_lib::calculate_param_commitment as bind_param_commitment;
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

/// bind(user_address): 509-byte bound-data layout
/// [identifier = 1 (USER_ADDRESS)][len_hi = 0][len_lo = 32][32-byte BE address][zero padding]
pub fn bind_user_address_commitment(account: Field) -> Field {
    let mut data = [0 as u8; 509];
    data[0] = 1;
    data[1] = 0;
    data[2] = 32;
    let bytes: [u8; 32] = account.to_be_bytes();
    for i in 0..32 {
        data[3 + i] = bytes[i];
    }
    bind_param_commitment(data)
}

mod test {
    use crate::commitments::{age_commitment, bind_user_address_commitment, disclose_commitment};

    // Values from harness/golden-vectors.json (regenerate with harness/golden-vectors.ts).
    global GOLDEN_AGE_18_0: Field = 0x2ccd6b1a6a0758a11ad3531939e69db3e11adbe90131cb38b69df90d55887d83;
    global GOLDEN_BIND: Field = 0x1fe004f678d9cf91bf41adf1ee3cd1b12f30799a167cc8c4c9307fa9a7399970;
    global GOLDEN_DISCLOSE: Field = 0x1b6d3f9e55b8456c4baf5f21d14e5e425b6d23df44e3067f561b0ab41cf7b59f;
    global GOLDEN_ACCOUNT: Field = 0x1122334455667788990011223344556677889900112233445566778899001122;

    #[test]
    fn age_matches_zkpassport_utils() {
        assert(age_commitment(18, 0) == GOLDEN_AGE_18_0);
    }

    #[test]
    fn bind_matches_zkpassport_utils() {
        assert(bind_user_address_commitment(GOLDEN_ACCOUNT) == GOLDEN_BIND);
    }

    #[test]
    fn disclose_matches_zkpassport_utils() {
        let mut mask = [false; 90];
        let mut bytes = [0 as u8; 90];
        mask[54] = true; mask[55] = true; mask[56] = true;
        bytes[54] = 65; bytes[55] = 85; bytes[56] = 83;
        assert(disclose_commitment(mask, bytes) == GOLDEN_DISCLOSE);
    }
    // sanctions_commitment: no independent TS golden exists; its correctness rests on
    // re-exporting the canonical circuits lib verbatim (same source the real circuit runs).
    // It gets a real end-to-end check if/when a sanctions fixture is added (M2 note).
}
