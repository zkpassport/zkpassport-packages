use crate::constants::{COUNTRY_LIST_LENGTH, SECONDS_BETWEEN_1900_AND_1970};
use bind_lib::calculate_param_commitment as bind_param_commitment;
use compare_age_lib::calculate_param_commitment as age_param_commitment;
use compare_date_lib::calculate_param_commitment as date_param_commitment;
use disclose_lib::calculate_param_commitment as disclose_param_commitment;
use exclusion_check_country_lib::{
    calculate_param_commitment as country_exclusion_param_commitment, check_country_list_sorted,
};
use exclusion_check_sanctions_lib::param_commit::calculate_param_commitment as sanctions_param_commitment;
use inclusion_check_country_lib::calculate_param_commitment as country_inclusion_param_commitment;
use utils::constants::{
    EMPTY_ALPHA3_COUNTRY_CODE, PROOF_TYPE_BIRTHDATE, PROOF_TYPE_EXPIRY_DATE,
    PROOF_TYPE_ISSUING_COUNTRY_EXCLUSION, PROOF_TYPE_ISSUING_COUNTRY_INCLUSION,
    PROOF_TYPE_NATIONALITY_EXCLUSION, PROOF_TYPE_NATIONALITY_INCLUSION,
};
use utils::types::{Alpha3CountryCode, DiscloseMask, MRZData};

/// age: Poseidon2([PROOF_TYPE_AGE, 2, min_age, max_age])
pub fn age_commitment(min_age: u8, max_age: u8) -> Field {
    age_param_commitment(min_age, max_age)
}

/// disclose: canonical circuits-lib commitment over (mask, masked bytes)
pub fn disclose_commitment(mask: DiscloseMask, disclosed: MRZData) -> Field {
    disclose_param_commitment(mask, disclosed)
}

/// birthdate between two bounds in Unix seconds (negative before 1970), 0 for no bound
pub fn birthdate_commitment(min_date: i64, max_date: i64) -> Field {
    date_param_commitment(
        PROOF_TYPE_BIRTHDATE,
        seconds_since_1900(min_date),
        seconds_since_1900(max_date),
    )
}

/// expiry date between two bounds in Unix seconds, 0 for no bound
pub fn expiry_date_commitment(min_date: u64, max_date: u64) -> Field {
    date_param_commitment(PROOF_TYPE_EXPIRY_DATE, min_date, max_date)
}

/// nationality in a list, given in the order the proof request lists it
pub fn nationality_inclusion_commitment<let N: u32>(countries: [Alpha3CountryCode; N]) -> Field {
    country_inclusion_commitment(PROOF_TYPE_NATIONALITY_INCLUSION, countries)
}

/// nationality not in a list, given in any order
pub fn nationality_exclusion_commitment<let N: u32>(countries: [Alpha3CountryCode; N]) -> Field {
    country_exclusion_commitment(PROOF_TYPE_NATIONALITY_EXCLUSION, countries)
}

/// issuing country in a list, given in the order the proof request lists it
pub fn issuing_country_inclusion_commitment<let N: u32>(
    countries: [Alpha3CountryCode; N],
) -> Field {
    country_inclusion_commitment(PROOF_TYPE_ISSUING_COUNTRY_INCLUSION, countries)
}

/// issuing country not in a list, given in any order
pub fn issuing_country_exclusion_commitment<let N: u32>(
    countries: [Alpha3CountryCode; N],
) -> Field {
    country_exclusion_commitment(PROOF_TYPE_ISSUING_COUNTRY_EXCLUSION, countries)
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

// The circuits count birthdates from 1900 so that they can reach before 1970.
fn seconds_since_1900(unix_seconds: i64) -> u64 {
    if unix_seconds == 0 {
        0
    } else {
        let seconds = unix_seconds + SECONDS_BETWEEN_1900_AND_1970;
        assert(seconds > 0, "birthdate bound before 1900");
        seconds as u64
    }
}

// An inclusion list is committed in its given order, padded with empty codes.
fn country_inclusion_commitment<let N: u32>(
    proof_type: u8,
    countries: [Alpha3CountryCode; N],
) -> Field {
    std::static_assert(N <= COUNTRY_LIST_LENGTH, "too many countries");
    let mut list = [EMPTY_ALPHA3_COUNTRY_CODE; COUNTRY_LIST_LENGTH];
    for i in 0..N {
        list[i] = countries[i];
    }

    country_inclusion_param_commitment(proof_type, list)
}

// An exclusion list is committed as the codes' weighted byte sums, in ascending order and padded
// with zeros, which is how the ZKPassport SDK sorts it for the prover.
fn country_exclusion_commitment<let N: u32>(
    proof_type: u8,
    countries: [Alpha3CountryCode; N],
) -> Field {
    std::static_assert(N <= COUNTRY_LIST_LENGTH, "too many countries");
    let sorted = countries.map(|country| country_weighted_sum(country)).sort();
    let mut list = [0 as u32; COUNTRY_LIST_LENGTH];
    for i in 0..N {
        list[i] = sorted[i];
    }

    // The circuits reject a repeated country, so no proof could match this list
    assert(check_country_list_sorted(list), "repeated country in exclusion list");
    country_exclusion_param_commitment(proof_type, list)
}

fn country_weighted_sum(country: Alpha3CountryCode) -> u32 {
    let bytes = country.as_bytes();
    (bytes[0] as u32) * 0x10000 + (bytes[1] as u32) * 0x100 + (bytes[2] as u32)
}

mod test {
    use crate::commitments::{
        age_commitment, bind_user_address_commitment, birthdate_commitment, disclose_commitment,
        expiry_date_commitment, issuing_country_exclusion_commitment,
        issuing_country_inclusion_commitment, nationality_exclusion_commitment,
        nationality_inclusion_commitment,
    };
    use crate::fixtures::{
        AGE_18_COMMITMENT, BIND_ACCOUNT, BIND_COMMITMENT, BIRTHDATE_COMMITMENT, DISCLOSE_COMMITMENT,
        EXPIRY_DATE_COMMITMENT, ISSUING_COUNTRY_EXCLUSION_COMMITMENT,
        ISSUING_COUNTRY_INCLUSION_COMMITMENT, NATIONALITY_EXCLUSION_COMMITMENT,
        NATIONALITY_INCLUSION_COMMITMENT,
    };

    #[test]
    fn age_matches_conformance_anchor() {
        assert(age_commitment(18, 0) == AGE_18_COMMITMENT);
    }

    #[test]
    fn bind_matches_conformance_anchor() {
        assert(bind_user_address_commitment(BIND_ACCOUNT) == BIND_COMMITMENT);
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

    #[test]
    fn birthdate_matches_conformance_anchor() {
        assert(birthdate_commitment(-631152000, 978220800) == BIRTHDATE_COMMITMENT);
    }

    #[test(should_fail_with = "birthdate bound before 1900")]
    fn birthdate_before_1900_rejected() {
        let _ = birthdate_commitment(-2209075200, 0); // 1899-12-31
    }

    #[test]
    fn expiry_date_matches_conformance_anchor() {
        assert(expiry_date_commitment(1798761600, 0) == EXPIRY_DATE_COMMITMENT);
    }

    #[test]
    fn nationality_inclusion_matches_conformance_anchor() {
        assert(
            nationality_inclusion_commitment(["FRA", "DEU", "ITA"])
                == NATIONALITY_INCLUSION_COMMITMENT,
        );
    }

    #[test]
    fn inclusion_order_changes_the_commitment() {
        assert(
            nationality_inclusion_commitment(["DEU", "FRA", "ITA"])
                != NATIONALITY_INCLUSION_COMMITMENT,
        );
    }

    #[test]
    fn nationality_exclusion_matches_conformance_anchor() {
        assert(
            nationality_exclusion_commitment(["PRK", "IRN", "SYR"])
                == NATIONALITY_EXCLUSION_COMMITMENT,
        );
    }

    #[test]
    fn exclusion_order_does_not_change_the_commitment() {
        assert(
            nationality_exclusion_commitment(["IRN", "PRK", "SYR"])
                == NATIONALITY_EXCLUSION_COMMITMENT,
        );
    }

    #[test(should_fail_with = "repeated country in exclusion list")]
    fn repeated_excluded_country_rejected() {
        let _ = nationality_exclusion_commitment(["PRK", "IRN", "PRK"]);
    }

    #[test]
    fn issuing_country_inclusion_matches_conformance_anchor() {
        assert(
            issuing_country_inclusion_commitment(["NLD", "BEL", "LUX"])
                == ISSUING_COUNTRY_INCLUSION_COMMITMENT,
        );
    }

    #[test]
    fn issuing_country_exclusion_matches_conformance_anchor() {
        assert(
            issuing_country_exclusion_commitment(["RUS", "BLR"])
                == ISSUING_COUNTRY_EXCLUSION_COMMITMENT,
        );
    }
}
