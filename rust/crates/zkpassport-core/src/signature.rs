//! SOD / ECDSA signature normalization.
//!
//! Port of `processECDSASignature` / `ensureLowSValue` from
//! `@zkpassport/utils` `src/circuit-matcher.ts`, including its
//! return-input-unchanged behavior on malformed ASN.1.

use crate::bytes::left_pad_with_zeros;
use num_bigint::BigUint;

fn ensure_low_s(s: &[u8], curve_n: &BigUint) -> Vec<u8> {
    let s_int = BigUint::from_bytes_be(s);
    let half_n = curve_n >> 1;
    if s_int > half_n {
        // s > n never happens for a valid signature; TS computes a negative
        // bigint there, which zk-kit converts to an empty buffer (→ all-zero
        // s after left-padding). Match that exactly.
        if &s_int > curve_n {
            return vec![];
        }
        // TS bigintToBytes: minimal big-endian bytes
        (curve_n - s_int).to_bytes_be()
    } else {
        s.to_vec()
    }
}

/// Normalize an ECDSA signature (raw r‖s or ASN.1 DER) into
/// left-padded r‖s with canonical low-s, matching the TS behavior exactly —
/// including returning the input unchanged when the DER structure is invalid.
pub fn process_ecdsa_signature(signature: &[u8], byte_size: usize, curve_n: &BigUint) -> Vec<u8> {
    if signature.len() == byte_size * 2 {
        let r = &signature[..byte_size];
        let s = ensure_low_s(&signature[byte_size..], curve_n);
        let mut out = left_pad_with_zeros(r, byte_size);
        out.extend(left_pad_with_zeros(&s, byte_size));
        return out;
    }

    if signature.first() != Some(&0x30) {
        return signature.to_vec();
    }
    let inner_length_index: usize = if signature.len() >= 2 && signature[1] as usize == signature.len() - 2 {
        1
    } else {
        2
    };
    if signature.len() <= inner_length_index + 2 {
        return signature.to_vec();
    }
    let inner_length = signature[inner_length_index] as usize;
    if signature[inner_length_index + 1] != 0x02
        || inner_length != signature.len() - inner_length_index - 1
    {
        return signature.to_vec();
    }
    let r_length = signature[inner_length_index + 2] as usize;
    let r_start = inner_length_index + 3;
    if signature.len() < r_start + r_length + 2 {
        return signature.to_vec();
    }
    let mut r: &[u8] = &signature[r_start..r_start + r_length];

    if signature[r_start + r_length] != 0x02 {
        return signature.to_vec();
    }
    let s_length = signature[r_start + r_length + 1] as usize;
    let s_start = r_start + r_length + 2;
    if signature.len() < s_start + s_length {
        return signature.to_vec();
    }
    let mut s: &[u8] = &signature[s_start..s_start + s_length];

    // Remove leading zeros (TS keeps at most the first nonzero onward)
    if let Some(pos) = r.iter().position(|&b| b != 0) {
        r = &r[pos..];
    }
    if let Some(pos) = s.iter().position(|&b| b != 0) {
        s = &s[pos..];
    }

    let s = ensure_low_s(s, curve_n);
    let mut out = left_pad_with_zeros(r, byte_size);
    out.extend(left_pad_with_zeros(&s, byte_size));
    out
}
