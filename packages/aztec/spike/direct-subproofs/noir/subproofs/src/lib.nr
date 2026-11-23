//! Verifies ZKPassport's subproofs directly, without the outer proof that ZKPassport's cloud prover
//! wraps them in. `glue` is the outer circuit's own checks (circuits 0.23.0, `outer_count_N`),
//! generic over the number of disclosure proofs. `verify` adds what `zkpassport::verify` checks on
//! an outer proof's public inputs.
pub mod types;
pub mod glue;
pub mod verify;
