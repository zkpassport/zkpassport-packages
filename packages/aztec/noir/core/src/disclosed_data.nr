use utils::types::{DiscloseMask, MRZData};

// ICAO 9303 MRZ layouts. Passports are TD3 (2 lines x 44 chars, zero-padded to
// the canonical 90-byte disclose payload); ID cards are TD1 (3 x 30 = 90 exactly).
// Offsets mirror @zkpassport/utils (passport/getters.ts).
pub global MRZ_DOC_TYPE_INDEX: u32 = 0; // document code bytes [0..2), both layouts
global ISSUING_COUNTRY_INDEX: u32 = 2; // both layouts
global TD1_DOCUMENT_NUMBER_INDEX: u32 = 5;
global TD1_BIRTHDATE_INDEX: u32 = 30;
global TD1_GENDER_INDEX: u32 = 37;
global TD1_EXPIRY_DATE_INDEX: u32 = 38;
global TD1_NATIONALITY_INDEX: u32 = 45; // ID cards
global TD1_NAME_INDEX: u32 = 60;
global TD1_NAME_LENGTH: u32 = 30;
global TD3_NAME_INDEX: u32 = 5;
global TD3_NAME_LENGTH: u32 = 39;
global TD3_DOCUMENT_NUMBER_INDEX: u32 = 44;
pub global TD3_NATIONALITY_INDEX: u32 = 54; // passports
global TD3_BIRTHDATE_INDEX: u32 = 57;
global TD3_GENDER_INDEX: u32 = 64;
global TD3_EXPIRY_DATE_INDEX: u32 = 65;

/// ICAO document codes: passports start with 'P'; TD1 ID cards with 'I'/'A'/'C'.
global ASCII_UPPER_P: u8 = 0x50;

pub struct DisclosedNationality {
    /// Raw alpha-3 bytes exactly as disclosed from the MRZ. NOT normalized:
    /// German documents carry "D<<", not "DEU" — normalize at display time, and
    /// keep any app-side claim-value packing raw so both sides stay in lockstep.
    pub nationality: [u8; 3],
    /// Big-endian pack of the 3 bytes (matches @zkpassport/utils' getCountryWeightedSum).
    packed: Field,
    is_id_card: bool,
}

/// Read the nationality out of a disclose payload, layout-aware (TD3 passports
/// vs TD1 ID cards put it at different MRZ offsets).
///
/// Soundness: the mask is PROVER-chosen (any mask yields a valid disclosure
/// commitment), so the layout must never be inferred from which ranges happen
/// to be unmasked — a passport holder could alias document-number bytes into
/// the TD1 nationality slot. The branch therefore reads the document code,
/// which is part of the signed MRZ — and so requires it disclosed: apps must
/// query `.disclose("document_type")` alongside `.disclose("nationality")`.
pub fn disclosed_nationality(mask: DiscloseMask, disclosed: MRZData) -> DisclosedNationality {
    let is_id_card = uses_id_card_layout(mask, disclosed);
    let start = if is_id_card {
        TD1_NATIONALITY_INDEX
    } else {
        TD3_NATIONALITY_INDEX
    };
    let nationality = disclosed_bytes(mask, disclosed, start, "nationality not disclosed");

    let mut packed: Field = 0;
    for i in 0..3 {
        packed = packed * 256 + (nationality[i] as Field);
    }
    DisclosedNationality { nationality, packed, is_id_card }
}

/// Read the document code, such as "P<" for a passport or "I<" for an ID card.
pub fn disclosed_document_type(mask: DiscloseMask, disclosed: MRZData) -> [u8; 2] {
    disclosed_bytes(
        mask,
        disclosed,
        MRZ_DOC_TYPE_INDEX,
        "document type not disclosed",
    )
}

/// Read the issuing country's three-letter code as the MRZ carries it ("D<<" for Germany).
pub fn disclosed_issuing_country(mask: DiscloseMask, disclosed: MRZData) -> [u8; 3] {
    disclosed_bytes(
        mask,
        disclosed,
        ISSUING_COUNTRY_INDEX,
        "issuing country not disclosed",
    )
}

/// Read the document number's nine MRZ characters, padded with '<'.
pub fn disclosed_document_number(mask: DiscloseMask, disclosed: MRZData) -> [u8; 9] {
    let start = if uses_id_card_layout(mask, disclosed) {
        TD1_DOCUMENT_NUMBER_INDEX
    } else {
        TD3_DOCUMENT_NUMBER_INDEX
    };
    disclosed_bytes(mask, disclosed, start, "document number not disclosed")
}

/// Read the date of birth as YYMMDD ASCII digits.
pub fn disclosed_birthdate(mask: DiscloseMask, disclosed: MRZData) -> [u8; 6] {
    let start = if uses_id_card_layout(mask, disclosed) {
        TD1_BIRTHDATE_INDEX
    } else {
        TD3_BIRTHDATE_INDEX
    };
    disclosed_bytes(mask, disclosed, start, "birthdate not disclosed")
}

/// Read the expiry date as YYMMDD ASCII digits.
pub fn disclosed_expiry_date(mask: DiscloseMask, disclosed: MRZData) -> [u8; 6] {
    let start = if uses_id_card_layout(mask, disclosed) {
        TD1_EXPIRY_DATE_INDEX
    } else {
        TD3_EXPIRY_DATE_INDEX
    };
    disclosed_bytes(mask, disclosed, start, "expiry date not disclosed")
}

/// Read the gender: 'M', 'F' or '<'.
pub fn disclosed_gender(mask: DiscloseMask, disclosed: MRZData) -> u8 {
    let start = if uses_id_card_layout(mask, disclosed) {
        TD1_GENDER_INDEX
    } else {
        TD3_GENDER_INDEX
    };
    let gender: [u8; 1] = disclosed_bytes(mask, disclosed, start, "gender not disclosed");
    gender[0]
}

/// Read the MRZ name field, such as "ERIKSSON<<ANNA<MARIA<<<", with 0 for each byte the proof
/// does not disclose. A request for the first or last name alone discloses only that part; a
/// proof that discloses none of the name fails.
pub fn disclosed_name(mask: DiscloseMask, disclosed: MRZData) -> BoundedVec<u8, TD3_NAME_LENGTH> {
    let mut name = BoundedVec::new();
    let mut any_byte_disclosed = false;
    if uses_id_card_layout(mask, disclosed) {
        for i in 0..TD1_NAME_LENGTH {
            name.push(disclosed[TD1_NAME_INDEX + i]);
            any_byte_disclosed |= mask[TD1_NAME_INDEX + i];
        }
    } else {
        for i in 0..TD3_NAME_LENGTH {
            name.push(disclosed[TD3_NAME_INDEX + i]);
            any_byte_disclosed |= mask[TD3_NAME_INDEX + i];
        }
    }

    assert(any_byte_disclosed, "name not disclosed");
    name
}

fn uses_id_card_layout(mask: DiscloseMask, disclosed: MRZData) -> bool {
    assert(mask[MRZ_DOC_TYPE_INDEX], "document type not disclosed");
    disclosed[MRZ_DOC_TYPE_INDEX] != ASCII_UPPER_P
}

fn disclosed_bytes<let N: u32, let M: u32>(
    mask: DiscloseMask,
    disclosed: MRZData,
    start: u32,
    message: str<M>,
) -> [u8; N] {
    let mut bytes = [0; N];
    for i in 0..N {
        assert(mask[start + i], message);
        bytes[i] = disclosed[start + i];
    }
    bytes
}

mod test {
    use crate::disclosed_data::{
        disclosed_birthdate, disclosed_document_number, disclosed_document_type,
        disclosed_expiry_date, disclosed_gender, disclosed_issuing_country, disclosed_name,
        disclosed_nationality,
    };

    fn payload<let N: u32>(doc: [u8; 2], index: u32, field: [u8; N]) -> ([bool; 90], [u8; 90]) {
        let mut mask = [false; 90];
        let mut bytes = [0 as u8; 90];
        mask[0] = true;
        mask[1] = true;
        bytes[0] = doc[0];
        bytes[1] = doc[1];
        for i in 0..N {
            mask[index + i] = true;
            bytes[index + i] = field[i];
        }
        (mask, bytes)
    }

    #[test]
    fn reads_document_type() {
        let (mask, bytes) = payload("I<".as_bytes(), 2, "SWE".as_bytes());

        assert(disclosed_document_type(mask, bytes) == "I<".as_bytes());
    }

    #[test(should_fail_with = "document type not disclosed")]
    fn rejects_partially_disclosed_document_type() {
        let (mut mask, bytes) = payload("I<".as_bytes(), 2, "SWE".as_bytes());
        mask[1] = false;

        let _ = disclosed_document_type(mask, bytes);
    }

    #[test]
    fn reads_issuing_country_from_passports_and_id_cards() {
        let (mask, bytes) = payload("P<".as_bytes(), 2, "SWE".as_bytes());
        assert(disclosed_issuing_country(mask, bytes) == "SWE".as_bytes());

        let (mask, bytes) = payload("I<".as_bytes(), 2, "SWE".as_bytes());
        assert(disclosed_issuing_country(mask, bytes) == "SWE".as_bytes());
    }

    #[test(should_fail_with = "issuing country not disclosed")]
    fn rejects_partially_disclosed_issuing_country() {
        let (mut mask, bytes) = payload("P<".as_bytes(), 2, "SWE".as_bytes());
        mask[4] = false;

        let _ = disclosed_issuing_country(mask, bytes);
    }

    #[test]
    fn reads_document_number_from_passports_and_id_cards() {
        let (mask, bytes) = payload("P<".as_bytes(), 44, "L898902C3".as_bytes());
        assert(disclosed_document_number(mask, bytes) == "L898902C3".as_bytes());

        let (mask, bytes) = payload("I<".as_bytes(), 5, "D23145890".as_bytes());
        assert(disclosed_document_number(mask, bytes) == "D23145890".as_bytes());
    }

    #[test(should_fail_with = "document number not disclosed")]
    fn rejects_partially_disclosed_document_number() {
        let (mut mask, bytes) = payload("P<".as_bytes(), 44, "L898902C3".as_bytes());
        mask[52] = false;

        let _ = disclosed_document_number(mask, bytes);
    }

    #[test]
    fn reads_birthdate_from_passports_and_id_cards() {
        let (mask, bytes) = payload("P<".as_bytes(), 57, "740812".as_bytes());
        assert(disclosed_birthdate(mask, bytes) == "740812".as_bytes());

        let (mask, bytes) = payload("I<".as_bytes(), 30, "740812".as_bytes());
        assert(disclosed_birthdate(mask, bytes) == "740812".as_bytes());
    }

    #[test(should_fail_with = "birthdate not disclosed")]
    fn rejects_partially_disclosed_birthdate() {
        let (mut mask, bytes) = payload("I<".as_bytes(), 30, "740812".as_bytes());
        mask[35] = false;

        let _ = disclosed_birthdate(mask, bytes);
    }

    #[test]
    fn reads_expiry_date_from_passports_and_id_cards() {
        let (mask, bytes) = payload("P<".as_bytes(), 65, "320415".as_bytes());
        assert(disclosed_expiry_date(mask, bytes) == "320415".as_bytes());

        let (mask, bytes) = payload("I<".as_bytes(), 38, "320415".as_bytes());
        assert(disclosed_expiry_date(mask, bytes) == "320415".as_bytes());
    }

    #[test(should_fail_with = "expiry date not disclosed")]
    fn rejects_partially_disclosed_expiry_date() {
        let (mut mask, bytes) = payload("P<".as_bytes(), 65, "320415".as_bytes());
        mask[70] = false;

        let _ = disclosed_expiry_date(mask, bytes);
    }

    #[test]
    fn reads_gender_from_passports_and_id_cards() {
        let (mask, bytes) = payload("P<".as_bytes(), 64, "F".as_bytes());
        assert(disclosed_gender(mask, bytes) == "F".as_bytes()[0]);

        let (mask, bytes) = payload("I<".as_bytes(), 37, "M".as_bytes());
        assert(disclosed_gender(mask, bytes) == "M".as_bytes()[0]);
    }

    #[test(should_fail_with = "gender not disclosed")]
    fn rejects_undisclosed_gender() {
        let (mut mask, bytes) = payload("I<".as_bytes(), 37, "M".as_bytes());
        mask[37] = false;

        let _ = disclosed_gender(mask, bytes);
    }

    #[test]
    fn reads_name_from_passports_and_id_cards() {
        let passport_name = "ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<".as_bytes();
        let (mask, bytes) = payload("P<".as_bytes(), 5, passport_name);
        assert(disclosed_name(mask, bytes) == BoundedVec::from_array(passport_name));

        let id_card_name = "ERIKSSON<<ANNA<MARIA<<<<<<<<<<".as_bytes();
        let (mask, bytes) = payload("I<".as_bytes(), 60, id_card_name);
        assert(disclosed_name(mask, bytes) == BoundedVec::from_array(id_card_name));
    }

    #[test]
    fn reads_first_name_alone_with_the_rest_of_the_name_as_zeros() {
        let first_name_with_separator = "<<ANNA".as_bytes();
        let (mask, bytes) = payload("P<".as_bytes(), 13, first_name_with_separator);

        let mut expected_name = [0; 39];
        for i in 0..6 {
            expected_name[8 + i] = first_name_with_separator[i];
        }
        assert(disclosed_name(mask, bytes) == BoundedVec::from_array(expected_name));
    }

    #[test(should_fail_with = "document type not disclosed")]
    fn rejects_name_without_document_type() {
        let (mut mask, bytes) = payload("P<".as_bytes(), 13, "<<ANNA".as_bytes());
        mask[0] = false;

        let _ = disclosed_name(mask, bytes);
    }

    #[test(should_fail_with = "name not disclosed")]
    fn rejects_a_passport_name_with_no_byte_disclosed() {
        let (mask, bytes) = payload("P<".as_bytes(), 54, "USA".as_bytes());

        let _ = disclosed_name(mask, bytes);
    }

    #[test(should_fail_with = "name not disclosed")]
    fn rejects_an_id_card_name_with_no_byte_disclosed() {
        let (mask, bytes) = payload("I<".as_bytes(), 45, "DEU".as_bytes());

        let _ = disclosed_name(mask, bytes);
    }

    #[test]
    fn td3_passport_reads_offset_54() {
        let (mask, bytes) = payload("P<".as_bytes(), 54, "USA".as_bytes());
        let d = disclosed_nationality(mask, bytes);
        assert(d.nationality == "USA".as_bytes());
        assert(d.packed == 0x555341);
        assert(!d.is_id_card);
    }

    #[test]
    fn td1_id_card_reads_offset_45() {
        let (mask, bytes) = payload("I<".as_bytes(), 45, "DEU".as_bytes());
        let d = disclosed_nationality(mask, bytes);
        assert(d.nationality == "DEU".as_bytes());
        assert(d.packed == 0x444555);
        assert(d.is_id_card);
    }

    #[test(should_fail_with = "document type not disclosed")]
    fn rejects_undisclosed_document_type() {
        let (mut mask, bytes) = payload("P<".as_bytes(), 54, "USA".as_bytes());
        mask[0] = false;
        let _ = disclosed_nationality(mask, bytes);
    }

    // Spoof attempt: passport document code, but "nationality" planted at the
    // TD1 offset (which on a TD3 doc holds document-number bytes). The
    // doc-code-driven branch forces the TD3 slot, which is masked -> rejected.
    #[test(should_fail_with = "nationality not disclosed")]
    fn rejects_td1_slot_on_a_passport() {
        let (mask, bytes) = payload("P<".as_bytes(), 45, "XXX".as_bytes());
        let _ = disclosed_nationality(mask, bytes);
    }

    #[test(should_fail_with = "nationality not disclosed")]
    fn rejects_partially_masked_nationality() {
        let (mut mask, bytes) = payload("P<".as_bytes(), 54, "USA".as_bytes());
        mask[56] = false;
        let _ = disclosed_nationality(mask, bytes);
    }
}
