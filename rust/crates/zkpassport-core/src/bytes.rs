//! Byte/bit → field packing.
//!
//! Port of the packing helpers in `@zkpassport/utils` `src/utils.ts`
//! (`packBeBytesIntoField`, `packBeBitsIntoField`, `packBeBytesIntoFields`,
//! `packLeBytesIntoFields`). These match the corresponding Noir functions, so
//! output must stay identical to the TS implementation — including the hex
//! string formats (`packBeBytesIntoFields` pads to even length,
//! `packLeBytesIntoFields` does not).

use num_bigint::BigUint;

/// Packs the first `max_field_size` bytes of `x` big-endian into an integer.
/// Panics if `x` is shorter than `max_field_size` (TS throws likewise).
pub fn pack_be_bytes_into_field(x: &[u8], max_field_size: usize) -> BigUint {
    let mut result = BigUint::from(0u8);
    for &byte in &x[..max_field_size] {
        result = (result << 8) + BigUint::from(byte);
    }
    result
}

/// Packs up to `max_field_size` bits (0/1 values) big-endian into an integer.
pub fn pack_be_bits_into_field(x: &[u8], max_field_size: usize) -> BigUint {
    let mut result = BigUint::from(0u8);
    for &bit in &x[..max_field_size.min(x.len())] {
        result = (result << 1) + BigUint::from(bit);
    }
    result
}

/// Numeric core of `pack_be_bytes_into_fields`: the first (possibly short)
/// chunk of the input lands in the LAST slot of the result, mirroring the TS loop.
pub fn pack_be_bytes_into_field_elems(bytes: &[u8], max_chunk_size: usize) -> Vec<BigUint> {
    if bytes.is_empty() {
        return vec![];
    }
    let total_fields = bytes.len().div_ceil(max_chunk_size);
    let mut result = vec![BigUint::from(0u8); total_fields];
    let rem = bytes.len() % max_chunk_size;
    let first_chunk_size = if rem == 0 { max_chunk_size } else { rem };
    let mut byte_index = 0;
    for field_index in (0..total_fields).rev() {
        let chunk_size = if field_index == total_fields - 1 {
            first_chunk_size
        } else {
            max_chunk_size
        };
        let mut value = BigUint::from(0u8);
        for _ in 0..chunk_size {
            value = (value << 8) | BigUint::from(bytes[byte_index]);
            byte_index += 1;
        }
        result[field_index] = value;
    }
    result
}

/// Numeric core of `pack_le_bytes_into_fields` (little-endian per chunk).
pub fn pack_le_bytes_into_field_elems(bytes: &[u8], max_chunk_size: usize) -> Vec<BigUint> {
    if bytes.is_empty() {
        return vec![];
    }
    let total_fields = bytes.len().div_ceil(max_chunk_size);
    let mut result = Vec::with_capacity(total_fields);
    let mut byte_index = 0;
    for _ in 0..total_fields {
        let remaining = bytes.len() - byte_index;
        let chunk_size = max_chunk_size.min(remaining);
        let mut value = BigUint::from(0u8);
        for i in (0..chunk_size).rev() {
            value = (value << 8) | BigUint::from(bytes[byte_index + i]);
        }
        byte_index += chunk_size;
        result.push(value);
    }
    result
}

/// Packs bytes into hex-string field elements big-endian, matching the Noir
/// `pack_be_bytes_into_fields` function (hex padded to even length).
pub fn pack_be_bytes_into_fields(bytes: &[u8], max_chunk_size: usize) -> Vec<String> {
    pack_be_bytes_into_field_elems(bytes, max_chunk_size)
        .iter()
        .map(|value| {
            let hex = format!("{value:x}");
            format!("0x{}{hex}", if hex.len() % 2 == 1 { "0" } else { "" })
        })
        .collect()
}

/// Packs bytes into hex-string field elements little-endian per chunk
/// (hex NOT padded to even length, as in the TS implementation).
pub fn pack_le_bytes_into_fields(bytes: &[u8], max_chunk_size: usize) -> Vec<String> {
    pack_le_bytes_into_field_elems(bytes, max_chunk_size)
        .iter()
        .map(|value| format!("0x{value:x}"))
        .collect()
}

/// Right-pad with zeros to `length` (no-op if already longer).
pub fn right_pad_with_zeros(bytes: &[u8], length: usize) -> Vec<u8> {
    let mut out = bytes.to_vec();
    if out.len() < length {
        out.resize(length, 0);
    }
    out
}

/// Left-pad with zeros to `length` (no-op if already longer).
pub fn left_pad_with_zeros(bytes: &[u8], length: usize) -> Vec<u8> {
    if bytes.len() >= length {
        return bytes.to_vec();
    }
    let mut out = vec![0u8; length - bytes.len()];
    out.extend_from_slice(bytes);
    out
}
