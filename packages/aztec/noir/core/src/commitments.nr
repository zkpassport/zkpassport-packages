use crate::constants::{
    BIND_ENTRIES_LENGTH, COUNTRY_LIST_LENGTH, CUSTOM_DATA_MAX_LENGTH, SECONDS_BETWEEN_1900_AND_1970,
};
use bind_lib::calculate_param_commitment as bind_param_commitment;
use compare_age_lib::calculate_param_commitment as age_param_commitment;
use compare_date_lib::calculate_param_commitment as date_param_commitment;
use disclose_lib::calculate_param_commitment as disclose_param_commitment;
use exclusion_check_country_lib::{
    calculate_param_commitment as country_exclusion_param_commitment, check_country_list_sorted,
};
use exclusion_check_sanctions_lib::param_commit::calculate_param_commitment as sanctions_param_commitment;
use facematch_lib::param_commit::calculate_param_commitment as face_match_param_commitment;
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

/// face match: Poseidon2([PROOF_TYPE_FACEMATCH, 5, root_key_leaf, environment, app_id_hash,
/// integrity_public_key_hash, mode])
pub fn face_match_commitment(
    root_key_leaf: Field,
    environment: u8,
    app_id_hash: Field,
    integrity_public_key_hash: Field,
    mode: u8,
) -> Field {
    face_match_param_commitment(
        root_key_leaf,
        environment,
        app_id_hash,
        integrity_public_key_hash,
        mode,
    )
}

/// sanctions record: Poseidon2([PROOF_TYPE_SANCTIONS_EXCLUSION, 2, root, is_strict])
pub fn sanctions_commitment(root: Field, is_strict: bool) -> Field {
    sanctions_param_commitment(root, is_strict)
}

/// bind(user_address, chain, custom_data): the 509-byte bound data @zkpassport/utils'
/// formatBoundData writes, then zero padding. The address and the custom data are optional, the
/// chain is not:
/// [identifier = 1 (USER_ADDRESS)][len_hi = 0][len_lo = 32][32-byte BE address]
/// [identifier = 2 (CHAIN_ID)][len_hi = 0][len_lo = n][chain id as n BE bytes, n as small as fits]
/// [identifier = 3 (CUSTOM_DATA)][len_hi][len_lo][custom data bytes]
/// An Aztec network's chain id is its rollup version, a 4-byte number, so `chain_id` must fit in
/// 4 bytes. formatBoundData writes no custom data entry for empty custom data, so `custom_data`
/// holds at least one byte when it is some.
pub fn bind_commitment(
    account: Option<Field>,
    chain_id: Field,
    custom_data: Option<BoundedVec<u8, CUSTOM_DATA_MAX_LENGTH>>,
) -> Field {
    let chain_id_bytes: [u8; 4] = chain_id.to_be_bytes();
    let leading_zero_bytes: u8 = if chain_id_bytes[0] != 0 {
        0
    } else if chain_id_bytes[1] != 0 {
        1
    } else if chain_id_bytes[2] != 0 {
        2
    } else {
        3
    };

    // The chain id and custom data entries, with the chain id in all 4 of its bytes
    let mut entries = [0 as u8; BIND_ENTRIES_LENGTH];
    entries[0] = 2;
    entries[1] = 0;
    entries[2] = 4 - leading_zero_bytes;
    for i in 0..4 {
        entries[3 + i] = chain_id_bytes[i];
    }
    if custom_data.is_some() {
        let custom_data = custom_data.unwrap();
        let length = custom_data.len();
        entries[7] = 3;
        entries[8] = (length >> 8) as u8;
        entries[9] = length as u8;
        for i in 0..CUSTOM_DATA_MAX_LENGTH {
            entries[10 + i] = if i < length {
                custom_data.get_unchecked(i)
            } else {
                0
            };
        }
    }

    // Dropping the chain id's leading zero bytes moves everything after them forward. Each byte is
    // picked from the 4 it can be at fixed indices, since a write at an index that depends on the
    // chain id costs far more gates.
    let (one, two, three) =
        (leading_zero_bytes == 1, leading_zero_bytes == 2, leading_zero_bytes == 3);
    let mut shifted = [0 as u8; BIND_ENTRIES_LENGTH];
    for i in 0..3 {
        shifted[i] = entries[i];
    }
    for i in 3..BIND_ENTRIES_LENGTH {
        let at = |offset: u32| {
            if i + offset < BIND_ENTRIES_LENGTH {
                entries[i + offset]
            } else {
                0
            }
        };
        shifted[i] = if three {
            at(3)
        } else if two {
            at(2)
        } else if one {
            at(1)
        } else {
            at(0)
        };
    }

    let mut data = [0 as u8; 509];
    if account.is_some() {
        data[0] = 1;
        data[1] = 0;
        data[2] = 32;
        let account_bytes: [u8; 32] = account.unwrap().to_be_bytes();
        for i in 0..32 {
            data[3 + i] = account_bytes[i];
        }
        for i in 0..BIND_ENTRIES_LENGTH {
            data[35 + i] = shifted[i];
        }
    } else {
        for i in 0..BIND_ENTRIES_LENGTH {
            data[i] = shifted[i];
        }
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
        age_commitment, bind_commitment, birthdate_commitment, disclose_commitment,
        expiry_date_commitment, face_match_commitment, issuing_country_exclusion_commitment,
        issuing_country_inclusion_commitment, nationality_exclusion_commitment,
        nationality_inclusion_commitment,
    };
    use crate::constants::CUSTOM_DATA_MAX_LENGTH;
    use crate::fixtures::{
        AGE_18_COMMITMENT, BIND_ACCOUNT, BIND_BASE_COMMITMENT, BIND_COMMITMENT,
        BIND_CUSTOM_DATA_BASE_COMMITMENT, BIND_CUSTOM_DATA_COMMITMENT,
        BIND_CUSTOM_DATA_ETHEREUM_COMMITMENT, BIND_CUSTOM_DATA_ETHEREUM_SEPOLIA_COMMITMENT,
        BIND_CUSTOM_DATA_WITHOUT_ACCOUNT_COMMITMENT, BIND_ETHEREUM_COMMITMENT,
        BIND_ETHEREUM_SEPOLIA_COMMITMENT, BIND_LONGEST_CUSTOM_DATA_COMMITMENT, BIRTHDATE_COMMITMENT,
        DISCLOSE_COMMITMENT, EXPIRY_DATE_COMMITMENT, FACE_MATCH_COMMITMENT,
        ISSUING_COUNTRY_EXCLUSION_COMMITMENT, ISSUING_COUNTRY_INCLUSION_COMMITMENT,
        NATIONALITY_EXCLUSION_COMMITMENT, NATIONALITY_INCLUSION_COMMITMENT,
    };

    #[test]
    fn age_matches_conformance_anchor() {
        assert(age_commitment(18, 0) == AGE_18_COMMITMENT);
    }

    #[test]
    fn bind_matches_conformance_anchor() {
        assert(bind_account(679261766) == BIND_COMMITMENT);
    }

    #[test]
    fn bind_writes_a_chain_id_in_as_few_bytes_as_utils() {
        assert(bind_account(1) == BIND_ETHEREUM_COMMITMENT);
        assert(bind_account(8453) == BIND_BASE_COMMITMENT);
        assert(bind_account(11155111) == BIND_ETHEREUM_SEPOLIA_COMMITMENT);
    }

    #[test(should_fail)]
    fn bind_rejects_a_chain_id_longer_than_4_bytes() {
        let _ = bind_account(0x100000000);
    }

    #[test]
    fn bind_with_custom_data_matches_conformance_anchor() {
        assert(bind_account_and_custom_data(679261766, "order-42") == BIND_CUSTOM_DATA_COMMITMENT);
    }

    #[test]
    fn bind_writes_custom_data_right_after_a_chain_id_as_short_as_utils_writes_it() {
        assert(bind_account_and_custom_data(1, "order-42") == BIND_CUSTOM_DATA_ETHEREUM_COMMITMENT);
        assert(bind_account_and_custom_data(8453, "order-42") == BIND_CUSTOM_DATA_BASE_COMMITMENT);
        assert(
            bind_account_and_custom_data(11155111, "order-42")
                == BIND_CUSTOM_DATA_ETHEREUM_SEPOLIA_COMMITMENT,
        );
    }

    #[test]
    fn bind_custom_data_without_an_account_matches_conformance_anchor() {
        let custom_data = BoundedVec::from_array("café".as_bytes());
        assert(
            bind_commitment(Option::none(), 679261766, Option::some(custom_data))
                == BIND_CUSTOM_DATA_WITHOUT_ACCOUNT_COMMITMENT,
        );
    }

    #[test]
    fn bind_longest_custom_data_matches_conformance_anchor() {
        let pattern = "0123456789abcdef".as_bytes();
        let mut custom_data = BoundedVec::new();
        for i in 0..CUSTOM_DATA_MAX_LENGTH {
            custom_data.push(pattern[i % 16]);
        }

        assert(
            bind_commitment(
                Option::some(BIND_ACCOUNT),
                679261766,
                Option::some(custom_data),
            )
                == BIND_LONGEST_CUSTOM_DATA_COMMITMENT,
        );
    }

    #[test]
    fn bind_ignores_bytes_past_the_custom_data_length() {
        let mut custom_data: BoundedVec<u8, CUSTOM_DATA_MAX_LENGTH> =
            BoundedVec::from_array("order-42".as_bytes());
        for i in 8..CUSTOM_DATA_MAX_LENGTH {
            custom_data.set_unchecked(i, 0xff);
        }

        assert(
            bind_commitment(
                Option::some(BIND_ACCOUNT),
                679261766,
                Option::some(custom_data),
            )
                == BIND_CUSTOM_DATA_COMMITMENT,
        );
    }

    fn bind_account(chain_id: Field) -> Field {
        bind_commitment(Option::some(BIND_ACCOUNT), chain_id, Option::none())
    }

    fn bind_account_and_custom_data<let N: u32>(chain_id: Field, custom_data: str<N>) -> Field {
        let custom_data = BoundedVec::from_array(custom_data.as_bytes());
        bind_commitment(
            Option::some(BIND_ACCOUNT),
            chain_id,
            Option::some(custom_data),
        )
    }

    #[test]
    fn face_match_matches_conformance_anchor() {
        let commitment = face_match_commitment(
            0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b,
            1,
            0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b,
            0,
            2,
        );
        assert(commitment == FACE_MATCH_COMMITMENT);
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
