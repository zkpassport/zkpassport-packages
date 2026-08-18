use aztec::protocol::address::AztecAddress;
use crate::types::{REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT, REGISTRY_SANCTIONS};

pub fn assert_valid_registry_id(registry_id: Field) {
    let ok = (registry_id == REGISTRY_CERTIFICATE)
        | (registry_id == REGISTRY_CIRCUIT)
        | (registry_id == REGISTRY_SANCTIONS);
    assert(ok, "unknown registry id");
}

pub fn assert_admin_or_oracle(sender: AztecAddress, admin: AztecAddress, oracle: AztecAddress) {
    assert((sender == admin) | (sender == oracle), "caller is not admin or oracle");
}

// IMP-2: L1 (`RegistryInstance.sol`) guards `transferAdmin`/`setOracle` against the zero
// address -- an unrecoverable, permanently-unassignable role otherwise, since no Aztec account
// can ever BE address zero. `setGuardian` has no such guard on L1, so it gets none here either.
pub fn assert_admin_not_zero(new_admin: AztecAddress) {
    assert(!new_admin.is_zero(), "admin cannot be zero address");
}

pub fn assert_oracle_not_zero(new_oracle: AztecAddress) {
    assert(!new_oracle.is_zero(), "oracle cannot be zero address");
}

#[test(should_fail_with = "admin cannot be zero address")]
fn transfer_admin_rejects_zero_address() {
    assert_admin_not_zero(AztecAddress::zero());
}

#[test(should_fail_with = "oracle cannot be zero address")]
fn set_oracle_rejects_zero_address() {
    assert_oracle_not_zero(AztecAddress::zero());
}
