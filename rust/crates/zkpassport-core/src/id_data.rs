//! ID-data circuit input builder.
//!
//! Port of `getIDDataCircuitInputs` (+ `getDSCDataInputs`, `getTBSMaxLen`)
//! from `@zkpassport/utils` `src/circuit-matcher.ts`. Takes pre-extracted
//! SOD/certificate fields; the SOD parser populates them upstream.

use crate::barrett::redc_limbs_from_bytes;
use crate::bytes::{left_pad_with_zeros, right_pad_with_zeros};
use crate::commitments::hash_salt_country_tbs;
use crate::integrity::{DG1_INPUT_SIZE, E_CONTENT_INPUT_SIZE, SIGNED_ATTR_INPUT_SIZE};
use crate::signature::process_ecdsa_signature;
use num_bigint::BigUint;
use serde_json::{json, Value};

/// TBS length bucket, as `getTBSMaxLen`.
pub fn get_tbs_max_len(tbs_len: usize) -> usize {
    if tbs_len <= 700 {
        700
    } else if tbs_len <= 1000 {
        1000
    } else if tbs_len <= 1200 {
        1200
    } else {
        1600
    }
}

/// DSC subject public key, pre-extracted from the certificate SPKI.
pub enum DscPublicKey {
    Rsa {
        /// Modulus as minimal big-endian bytes.
        modulus: Vec<u8>,
        exponent: u64,
    },
    Ecdsa {
        /// Uncompressed EC point (0x04 ‖ X ‖ Y).
        public_key: Vec<u8>,
        /// Curve order, for low-s normalization of the SOD signature.
        curve_n: BigUint,
        /// Curve field size in bytes (e.g. 32 for P-256).
        curve_byte_size: usize,
    },
}

/// Raw fields the ID-data builder needs.
pub struct IdDataInput<'a> {
    pub dg1: &'a [u8],
    pub e_content: &'a [u8],
    pub signed_attributes: &'a [u8],
    /// SOD signerInfo signature, raw (normalization happens here).
    pub sod_signature: &'a [u8],
    /// DSC TBS certificate bytes, raw (unpadded).
    pub tbs_certificate: &'a [u8],
    /// DSC country (alpha-3), as `getDSCCountry` extracts it.
    pub dsc_country: &'a str,
    pub dsc_pubkey: DscPublicKey,
    /// RSA-PSS salt length (0 for PKCS#1 v1.5 / ECDSA).
    pub pss_salt_len: u32,
}

fn hex_min(x: &BigUint) -> String {
    format!("0x{x:x}")
}

fn hex_even(x: &BigUint) -> String {
    let hex = format!("{x:x}");
    format!("0x{}{hex}", if hex.len() % 2 == 1 { "0" } else { "" })
}

pub fn get_id_data_circuit_inputs(
    data: &IdDataInput,
    salt_in: &BigUint,
    salt_out: &BigUint,
) -> Value {
    let max_tbs_length = get_tbs_max_len(data.tbs_certificate.len());
    let tbs_padded = right_pad_with_zeros(data.tbs_certificate, max_tbs_length);

    let comm_in = hash_salt_country_tbs(salt_in, data.dsc_country, &tbs_padded);

    let dg1 = right_pad_with_zeros(data.dg1, DG1_INPUT_SIZE);
    let e_content = right_pad_with_zeros(data.e_content, E_CONTENT_INPUT_SIZE);
    let signed_attributes = right_pad_with_zeros(data.signed_attributes, SIGNED_ATTR_INPUT_SIZE);

    match &data.dsc_pubkey {
        DscPublicKey::Ecdsa {
            public_key,
            curve_n,
            curve_byte_size,
        } => {
            // Skip the 0x04 uncompressed-point tag, split into X ‖ Y
            let half = (public_key.len() - 1) / 2;
            let dsc_pubkey_x = &public_key[1..half + 1];
            let dsc_pubkey_y = &public_key[half + 1..];
            let sod_signature =
                process_ecdsa_signature(data.sod_signature, *curve_byte_size, curve_n);
            json!({
                "dg1": dg1,
                "signed_attributes": signed_attributes,
                "comm_in": hex_even(&comm_in),
                "salt_in": hex_min(salt_in),
                "salt_out": hex_min(salt_out),
                "e_content": e_content,
                "tbs_certificate": tbs_padded,
                "dsc_pubkey_x": dsc_pubkey_x,
                "dsc_pubkey_y": dsc_pubkey_y,
                "sod_signature": sod_signature,
            })
        }
        DscPublicKey::Rsa { modulus, exponent } => {
            let modulus_int = BigUint::from_bytes_be(modulus);
            let modulus_bits = modulus_int.bits() as usize;
            let modulus_bytes =
                left_pad_with_zeros(&modulus_int.to_bytes_be(), modulus_bits.div_ceil(8));
            let redc_param = left_pad_with_zeros(
                &redc_limbs_from_bytes(&modulus_bytes),
                modulus_bits.div_ceil(8) + 1,
            );
            let pubkey_size = modulus_bytes.len();
            json!({
                "dg1": dg1,
                "signed_attributes": signed_attributes,
                "comm_in": hex_even(&comm_in),
                "salt_in": hex_min(salt_in),
                "salt_out": hex_min(salt_out),
                "e_content": e_content,
                "dsc_pubkey": modulus_bytes,
                "exponent": exponent,
                "sod_signature": left_pad_with_zeros(data.sod_signature, pubkey_size),
                "dsc_pubkey_redc_param": redc_param,
                "tbs_certificate": tbs_padded,
                "pss_salt_len": data.pss_salt_len,
            })
        }
    }
}
