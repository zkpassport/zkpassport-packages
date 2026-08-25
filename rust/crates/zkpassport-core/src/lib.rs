//! ZKPassport native core.
//!
//! Rust port of the crypto/business-logic core of `@zkpassport/utils`
//! (circuit input generation and its supporting primitives), intended to be
//! the single implementation shared by:
//! - iOS full app + App Clip (C ABI, staticlib)
//! - Android full app (JNI, cdylib)
//! - JS/TS consumers (wasm-bindgen; the TS package becomes a thin wrapper)
//!
//! Every ported function is differential-tested against the TypeScript
//! implementation via generated vectors (see `rust/scripts/gen-vectors.ts`
//! and `tests/differential.rs`). The TS code stays as the oracle until a
//! module is fully ported and proof-tested end-to-end.

pub mod barrett;
pub mod bytes;
pub mod commitments;
pub mod curves;
mod curves_gen;
pub mod der;
pub mod disclosure;
pub mod dsc;
pub mod id_data;
pub mod input_gen;
pub mod integrity;
pub mod merkle;
mod oids_gen;
pub mod outer;
pub mod plan;
pub mod poseidon2;
pub mod query;
pub mod registry;
pub mod select;
pub mod signature;
pub mod sod;
