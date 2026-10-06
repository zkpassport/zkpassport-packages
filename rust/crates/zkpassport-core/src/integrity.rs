//! Integrity-check circuit input builder.
//!
//! Port of `getIntegrityCheckCircuitInputs` from `@zkpassport/utils`
//! `src/circuit-matcher.ts`. Takes the raw fields extracted from the passport
//! (SOD parsing happens upstream) and produces JSON identical to the TS
//! builder's output. The TS builder's `getDSCDataInputs`/`getIDDataInputs`
//! null-checks are upstream validation, not part of the output computation.

use crate::bytes::right_pad_with_zeros;
use crate::commitments::{
    calculate_private_nullifier, hash_salt_country_signed_attr_dg1_e_content_private_nullifier,
    IntegrityToDisclosureSalts,
};
use num_bigint::BigUint;
use serde_json::{json, Value};

pub const DG1_INPUT_SIZE: usize = 95;
pub const E_CONTENT_INPUT_SIZE: usize = 700;
pub const SIGNED_ATTR_INPUT_SIZE: usize = 256;

/// `0x`-prefixed minimal lowercase hex, as TS `` `0x${x.toString(16)}` ``.
fn hex_min(x: &BigUint) -> String {
    format!("0x{x:x}")
}

/// `Binary.from(bigint).toHex()`: minimal bytes, hex padded to even length.
fn hex_even(x: &BigUint) -> String {
    let hex = format!("{x:x}");
    format!("0x{}{hex}", if hex.len() % 2 == 1 { "0" } else { "" })
}

/// Raw per-passport fields the builder needs (all unpadded, as parsed from
/// the SOD / data groups).
pub struct IntegrityInputData<'a> {
    pub dg1: &'a [u8],
    pub e_content: &'a [u8],
    pub signed_attributes: &'a [u8],
    /// SOD signerInfo signature, already normalized via
    /// `process_ecdsa_signature` for ECDSA documents (RSA passes through).
    pub sod_signature_processed: &'a [u8],
    /// DSC country (alpha-3), as `getDSCCountry` extracts it.
    pub dsc_country: &'a str,
}

pub fn get_integrity_check_circuit_inputs(
    data: &IntegrityInputData,
    salt_in: &BigUint,
    salts_out: &IntegrityToDisclosureSalts,
) -> Value {
    let dg1_padded = right_pad_with_zeros(data.dg1, DG1_INPUT_SIZE);
    let e_content_padded = right_pad_with_zeros(data.e_content, E_CONTENT_INPUT_SIZE);
    let signed_attrs_padded = right_pad_with_zeros(data.signed_attributes, SIGNED_ATTR_INPUT_SIZE);

    let private_nullifier = calculate_private_nullifier(
        &dg1_padded,
        &e_content_padded,
        data.sod_signature_processed,
    );

    let comm_in = hash_salt_country_signed_attr_dg1_e_content_private_nullifier(
        salt_in,
        data.dsc_country,
        &signed_attrs_padded,
        &BigUint::from(data.signed_attributes.len()),
        &dg1_padded,
        &e_content_padded,
        &private_nullifier,
    );

    json!({
        "salted_dg1": {
            "value": dg1_padded,
            "salt": hex_min(&salts_out.dg1_salt),
            "hash": "0x0",
        },
        "salted_private_nullifier": {
            "value": hex_min(&private_nullifier),
            "salt": hex_min(&salts_out.private_nullifier_salt),
            "hash": "0x0",
        },
        "expiry_date_salt": hex_min(&salts_out.expiry_date_salt),
        "dg2_hash_salt": hex_min(&salts_out.dg2_hash_salt),
        "signed_attributes": signed_attrs_padded,
        "e_content": e_content_padded,
        "comm_in": hex_even(&comm_in),
        "salt_in": hex_min(salt_in),
    })
}
