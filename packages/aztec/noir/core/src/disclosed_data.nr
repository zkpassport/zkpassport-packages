use utils::types::{DiscloseMask, MRZData};

// ICAO 9303 MRZ layouts. Passports are TD3 (2 lines x 44 chars, zero-padded to
// the canonical 90-byte disclose payload); ID cards are TD1 (3 x 30 = 90 exactly).
// Offsets mirror @zkpassport/utils (passport/getters.ts, getNationalityRange).
pub global MRZ_DOC_TYPE_INDEX: u32 = 0; // document code bytes [0..2), both layouts
pub global TD1_NATIONALITY_INDEX: u32 = 45; // ID cards
pub global TD3_NATIONALITY_INDEX: u32 = 54; // passports

/// ICAO document codes: passports start with 'P'; TD1 ID cards with 'I'/'A'/'C'.
global ASCII_UPPER_P: u8 = 0x50;

pub struct DisclosedNationality {
    /// Raw alpha-3 bytes exactly as disclosed from the MRZ. NOT normalized:
    /// German documents carry "D<<", not "DEU" — normalize at display time, and
    /// keep any app-side claim-value packing raw so both sides stay in lockstep.
    pub nationality: [u8; 3],
    /// Big-endian pack of the 3 bytes (matches @zkpassport/utils' getCountryWeightedSum).
    pub packed: Field,
    pub is_id_card: bool,
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
    assert(mask[MRZ_DOC_TYPE_INDEX], "document type not disclosed");
    let is_id_card = disclosed[MRZ_DOC_TYPE_INDEX] != ASCII_UPPER_P;
    let start = if is_id_card {
        TD1_NATIONALITY_INDEX
    } else {
        TD3_NATIONALITY_INDEX
    };
    let mut nationality = [0; 3];
    let mut packed: Field = 0;
    for i in 0..3 {
        assert(mask[start + i], "nationality not disclosed");
        nationality[i] = disclosed[start + i];
        packed = packed * 256 + (disclosed[start + i] as Field);
    }
    DisclosedNationality { nationality, packed, is_id_card }
}

mod test {
    use crate::disclosed_data::disclosed_nationality;

    fn payload(doc: [u8; 2], index: u32, nat: [u8; 3]) -> ([bool; 90], [u8; 90]) {
        let mut mask = [false; 90];
        let mut bytes = [0 as u8; 90];
        mask[0] = true;
        mask[1] = true;
        bytes[0] = doc[0];
        bytes[1] = doc[1];
        for i in 0..3 {
            mask[index + i] = true;
            bytes[index + i] = nat[i];
        }
        (mask, bytes)
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
