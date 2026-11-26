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
use inclusion_check_country_lib::calculate_param_commitment as country_inclusion_param_commitment;
use poseidon::poseidon2::Poseidon2;
use utils::constants::{
    EMPTY_ALPHA3_COUNTRY_CODE, PROOF_TYPE_BIRTHDATE, PROOF_TYPE_EXPIRY_DATE, PROOF_TYPE_FACEMATCH,
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

/// face match, as circuits 0.23.0 commit it: Poseidon2([PROOF_TYPE_FACEMATCH, 6, root_key_leaf,
/// environment, app_id_hash, integrity_public_key_hash, facematch_mode, revocation_root]).
/// The facematch lib at the pinned circuits tag predates the revocation root and commits five
/// fields, so this doesn't call it.
pub fn face_match_commitment(
    root_key_leaf: Field,
    environment: u8,
    app_id_hash: Field,
    integrity_public_key_hash: Field,
    facematch_mode: u8,
    revocation_root: Field,
) -> Field {
    let params = [
        PROOF_TYPE_FACEMATCH as Field,
        6,
        root_key_leaf,
        environment as Field,
        app_id_hash,
        integrity_public_key_hash,
        facematch_mode as Field,
        revocation_root,
    ];
    Poseidon2::hash(params, params.len())
}

/// sanctions record: Poseidon2([PROOF_TYPE_SANCTIONS_EXCLUSION, 2, root, is_strict])
pub fn sanctions_commitment(root: Field, is_strict: bool) -> Field {
    sanctions_param_commitment(root, is_strict)
}

// The identifiers of the entries in the bound data
global BOUND_USER_ADDRESS: u8 = 1;
global BOUND_CHAIN_ID: u8 = 2;
global BOUND_CUSTOM_DATA: u8 = 3;

/// bind(user_address, chain, custom_data): the bound data @zkpassport/utils' formatBoundData
/// writes, then zero padding to 509 bytes. Each entry is an identifier, a 2-byte big-endian length
/// and the value, in this order:
///
/// | entry        | identifier | value                                                  |
/// |--------------|------------|--------------------------------------------------------|
/// | user address | 1          | 32 bytes, big-endian; left out when `account` is none  |
/// | chain id     | 2          | as few big-endian bytes as hold it, 1 to 4             |
/// | custom data  | 3          | 1 to 464 bytes; left out when `custom_data` is none    |
///
/// An Aztec network's chain id is its rollup version, which fits in 4 bytes. formatBoundData
/// writes no custom data entry for empty custom data, so `custom_data` holds at least one byte
/// when it is some.
pub fn bind_commitment(
    account: Option<Field>,
    chain_id: Field,
    custom_data: Option<BoundedVec<u8, CUSTOM_DATA_MAX_LENGTH>>,
) -> Field {
    let chain_id_bytes: [u8; 4] = chain_id.to_be_bytes();
    let unused_chain_id_bytes = leading_zero_bytes(chain_id_bytes);

    // The chain id and custom data entries, first with all 4 bytes of the chain id
    let mut entries = [0 as u8; BIND_ENTRIES_LENGTH];
    entries[0] = BOUND_CHAIN_ID;
    entries[2] = 4 - unused_chain_id_bytes;
    for i in 0..4 {
        entries[3 + i] = chain_id_bytes[i];
    }
    if custom_data.is_some() {
        let custom_data = custom_data.unwrap();
        let length = custom_data.len();
        entries[7] = BOUND_CUSTOM_DATA;
        entries[8] = (length >> 8) as u8;
        entries[9] = length as u8;
        for i in 0..CUSTOM_DATA_MAX_LENGTH {
            if i < length {
                entries[10 + i] = custom_data.get_unchecked(i);
            }
        }
    }
    let entries = remove_bytes(entries, 3, unused_chain_id_bytes);

    let mut data = [0 as u8; 509];
    if account.is_some() {
        let account_bytes: [u8; 32] = account.unwrap().to_be_bytes();
        data[0] = BOUND_USER_ADDRESS;
        data[2] = 32;
        for i in 0..32 {
            data[3 + i] = account_bytes[i];
        }
        for i in 0..BIND_ENTRIES_LENGTH {
            data[35 + i] = entries[i];
        }
    } else {
        for i in 0..BIND_ENTRIES_LENGTH {
            data[i] = entries[i];
        }
    }

    bind_param_commitment(data)
}

// The number of leading zero bytes in a 4-byte big-endian number, at most 3: a zero chain id
// takes one byte
fn leading_zero_bytes(bytes: [u8; 4]) -> u8 {
    if bytes[0] != 0 {
        0
    } else if bytes[1] != 0 {
        1
    } else if bytes[2] != 0 {
        2
    } else {
        3
    }
}

// `bytes` with `count` bytes, 0 to 3, removed at `index`: the bytes after them move forward and
// zeros fill the end. Each byte is picked from the 4 it can come from, at fixed positions, because
// writing at a position that depends on `count` costs far more gates.
fn remove_bytes<let N: u32>(bytes: [u8; N], index: u32, count: u8) -> [u8; N] {
    let byte_at = |i: u32| if i < N { bytes[i] } else { 0 };

    let mut removed = bytes;
    for i in index..N {
        removed[i] = if count == 3 {
            byte_at(i + 3)
        } else if count == 2 {
            byte_at(i + 2)
        } else if count == 1 {
            byte_at(i + 1)
        } else {
            bytes[i]
        };
    }
    removed
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
    use crate::app_attest::{APPLE_ROOT_KEY_HASH, IOS_APP_CLIP_APP_ID_HASH, IOS_APP_ID_HASH};
    use crate::commitments::{
        age_commitment, bind_commitment, birthdate_commitment, disclose_commitment,
        expiry_date_commitment, face_match_commitment, issuing_country_exclusion_commitment,
        issuing_country_inclusion_commitment, nationality_exclusion_commitment,
        nationality_inclusion_commitment, sanctions_commitment,
    };
    use crate::constants::CUSTOM_DATA_MAX_LENGTH;
    use crate::fixtures::{
        AGE_18_COMMITMENT, BIND_ACCOUNT, BIND_BASE_COMMITMENT, BIND_COMMITMENT,
        BIND_CUSTOM_DATA_BASE_COMMITMENT, BIND_CUSTOM_DATA_COMMITMENT,
        BIND_CUSTOM_DATA_ETHEREUM_COMMITMENT, BIND_CUSTOM_DATA_ETHEREUM_SEPOLIA_COMMITMENT,
        BIND_CUSTOM_DATA_WITHOUT_ACCOUNT_COMMITMENT, BIND_ETHEREUM_COMMITMENT,
        BIND_ETHEREUM_SEPOLIA_COMMITMENT, BIND_LONGEST_CUSTOM_DATA_COMMITMENT, BIRTHDATE_COMMITMENT,
        DISCLOSE_COMMITMENT, EXPIRY_DATE_COMMITMENT, FACE_MATCH_IOS_APP_CLIP_REGULAR_COMMITMENT,
        FACE_MATCH_IOS_STRICT_COMMITMENT, ISSUING_COUNTRY_EXCLUSION_COMMITMENT,
        ISSUING_COUNTRY_INCLUSION_COMMITMENT, NATIONALITY_EXCLUSION_COMMITMENT,
        NATIONALITY_INCLUSION_COMMITMENT, SANCTIONS_COMMITMENT, SANCTIONS_ROOT,
    };

    #[test]
    fn age_matches_conformance_anchor() {
        assert(age_commitment(18, 0) == AGE_18_COMMITMENT);
    }

    #[test]
    fn sanctions_matches_conformance_anchor() {
        assert(sanctions_commitment(SANCTIONS_ROOT, true) == SANCTIONS_COMMITMENT);
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
    fn face_match_matches_conformance_anchors() {
        assert(
            face_match_commitment(APPLE_ROOT_KEY_HASH, 1, IOS_APP_ID_HASH, 0, 2, 0)
                == FACE_MATCH_IOS_STRICT_COMMITMENT,
        );
        assert(
            face_match_commitment(APPLE_ROOT_KEY_HASH, 1, IOS_APP_CLIP_APP_ID_HASH, 0, 1, 0)
                == FACE_MATCH_IOS_APP_CLIP_REGULAR_COMMITMENT,
        );
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
