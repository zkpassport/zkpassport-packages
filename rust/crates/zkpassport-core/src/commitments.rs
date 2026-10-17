//! Commitment / nullifier primitives.
//!
//! Port of the hashing helpers in `@zkpassport/utils` `src/circuits/index.ts`
//! and the `SaltedValue` hash from `src/types/index.ts`. All inputs are
//! expected pre-padded exactly as the TS callers pad them (the TS functions
//! receive already-padded `Binary` values).

use crate::bytes::{pack_be_bytes_into_field_elems, pack_le_bytes_into_field_elems};
use crate::poseidon2::poseidon2_hash;
use num_bigint::BigUint;

/// `SaltedValue.getHash()` for a byte-array value:
/// poseidon2([salt, ...packBeBytesIntoFields(value, 31)])
pub fn salted_value_hash_bytes(salt: &BigUint, value: &[u8]) -> BigUint {
    let mut inputs = vec![salt.clone()];
    inputs.extend(pack_be_bytes_into_field_elems(value, 31));
    poseidon2_hash(&inputs)
}

/// `SaltedValue.getHash()` for a scalar value: poseidon2([salt, value])
pub fn salted_value_hash_scalar(salt: &BigUint, value: &BigUint) -> BigUint {
    poseidon2_hash(&[salt.clone(), value.clone()])
}

/// poseidon2 over the 31-byte BE packing of dg1 ‖ eContent ‖ sodSig.
/// Callers pass dg1 padded to `DG1_INPUT_SIZE` and eContent padded to
/// `E_CONTENT_INPUT_SIZE`, as in the TS call sites.
pub fn calculate_private_nullifier(dg1: &[u8], e_content: &[u8], sod_sig: &[u8]) -> BigUint {
    let mut inputs = Vec::new();
    inputs.extend(pack_be_bytes_into_field_elems(dg1, 31));
    inputs.extend(pack_be_bytes_into_field_elems(e_content, 31));
    inputs.extend(pack_be_bytes_into_field_elems(sod_sig, 31));
    poseidon2_hash(&inputs)
}

/// poseidon2([salt, ...pack(country ascii), ...pack(tbs padded to maxTbsLength)])
pub fn hash_salt_country_tbs(salt: &BigUint, country: &str, tbs_padded: &[u8]) -> BigUint {
    let mut inputs = vec![salt.clone()];
    inputs.extend(pack_be_bytes_into_field_elems(country.as_bytes(), 31));
    inputs.extend(pack_be_bytes_into_field_elems(tbs_padded, 31));
    poseidon2_hash(&inputs)
}

/// The integrity-check `comm_in`:
/// poseidon2([salt, ...pack(country), ...pack(paddedSignedAttr), signedAttrSize,
///            ...pack(dg1), ...pack(eContent), privateNullifier])
#[allow(clippy::too_many_arguments)]
pub fn hash_salt_country_signed_attr_dg1_e_content_private_nullifier(
    salt: &BigUint,
    country: &str,
    padded_signed_attr: &[u8],
    signed_attr_size: &BigUint,
    dg1: &[u8],
    e_content: &[u8],
    private_nullifier: &BigUint,
) -> BigUint {
    let mut inputs = vec![salt.clone()];
    inputs.extend(pack_be_bytes_into_field_elems(country.as_bytes(), 31));
    inputs.extend(pack_be_bytes_into_field_elems(padded_signed_attr, 31));
    inputs.push(signed_attr_size.clone());
    inputs.extend(pack_be_bytes_into_field_elems(dg1, 31));
    inputs.extend(pack_be_bytes_into_field_elems(e_content, 31));
    inputs.push(private_nullifier.clone());
    poseidon2_hash(&inputs)
}

/// poseidon2 over the 31-byte LE packing of the input (`packLeBytesAndHashPoseidon2`).
pub fn pack_le_bytes_and_hash_poseidon2(input: &[u8]) -> BigUint {
    let packed = pack_le_bytes_into_field_elems(input, 31);
    poseidon2_hash(&packed)
}

/// `normalizeDg2Hash` — LE-pack the dg2 hash bytes and poseidon2 them.
pub fn normalize_dg2_hash(dg2_hash: &[u8]) -> BigUint {
    pack_le_bytes_and_hash_poseidon2(dg2_hash)
}

pub struct IntegrityToDisclosureSalts {
    pub dg1_salt: BigUint,
    pub expiry_date_salt: BigUint,
    pub dg2_hash_salt: BigUint,
    pub private_nullifier_salt: BigUint,
}

/// The disclosure-side `comm_in` (`hashSaltDg1Dg2HashPrivateNullifier`):
/// poseidon2 over the five SaltedValue hashes.
pub fn hash_salt_dg1_dg2_hash_private_nullifier(
    salts: &IntegrityToDisclosureSalts,
    dg1: &[u8],
    expiry_date: &str,
    dg2_hash_normalized: &BigUint,
    dg2_hash_type: u32,
    private_nullifier: &BigUint,
) -> BigUint {
    let inputs = vec![
        salted_value_hash_bytes(&salts.dg1_salt, dg1),
        salted_value_hash_bytes(&salts.expiry_date_salt, expiry_date.as_bytes()),
        salted_value_hash_scalar(&salts.dg2_hash_salt, dg2_hash_normalized),
        salted_value_hash_scalar(&salts.dg2_hash_salt, &BigUint::from(dg2_hash_type)),
        salted_value_hash_scalar(&salts.private_nullifier_salt, private_nullifier),
    ];
    poseidon2_hash(&inputs)
}
