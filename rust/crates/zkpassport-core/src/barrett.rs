//! Barrett reduction parameter limbs.
//!
//! Port of `@zkpassport/utils` `src/barrett-reduction.ts`. Output must stay
//! byte-identical to the TS implementation, including its hex-string padding
//! quirks (the first limb is padded to `totalBytes % 15` hex chars, not bytes).

use num_bigint::BigUint;
use num_traits::One;

const BARRETT_REDUCTION_OVERFLOW_BITS: u64 = 6;

/// redc param = 2^(2k + overflow) / modulus, k = bit length of modulus
fn barrett_reduction_parameter(modulus: &BigUint) -> BigUint {
    let k = modulus.bits();
    let multiplicand = BigUint::one() << (2 * k + BARRETT_REDUCTION_OVERFLOW_BITS);
    multiplicand / modulus
}

fn split_into_120_bit_limbs(mut input: BigUint, num_bits: u64) -> Vec<BigUint> {
    let num_limbs = num_bits / 120 + u64::from(num_bits % 120 != 0);
    let mask = (BigUint::one() << 120u32) - BigUint::one();
    let mut result = Vec::with_capacity(num_limbs as usize);
    for _ in 0..num_limbs {
        result.push(&input & &mask);
        input >>= 120u32;
    }
    result
}

/// Byte representation of the Barrett reduction parameter as 120-bit limbs,
/// most significant limb first.
pub fn redc_limbs(bn: &BigUint, num_bits: u64) -> Vec<u8> {
    let redc_param = barrett_reduction_parameter(bn);
    let limbs = split_into_120_bit_limbs(redc_param, num_bits);
    let total_bytes = num_bits / 8 + u64::from(num_bits % 8 != 0);
    let mut out = Vec::new();
    for (i, limb) in limbs.iter().rev().enumerate() {
        let hex = format!("{limb:x}");
        // TS: first limb padStart(totalBytes % 15), others padStart(30) — in hex chars
        let width = if i == 0 { (total_bytes % 15) as usize } else { 30 };
        let mut padded = if hex.len() < width {
            format!("{}{hex}", "0".repeat(width - hex.len()))
        } else {
            hex
        };
        if padded.len() % 2 != 0 {
            padded.insert(0, '0');
        }
        for j in (0..padded.len()).step_by(2) {
            out.push(u8::from_str_radix(&padded[j..j + 2], 16).expect("hex digits"));
        }
    }
    out
}

pub fn redc_limbs_from_bytes(bytes: &[u8]) -> Vec<u8> {
    let bn = BigUint::from_bytes_be(bytes);
    let bits = bn.bits();
    redc_limbs(&bn, bits)
}
