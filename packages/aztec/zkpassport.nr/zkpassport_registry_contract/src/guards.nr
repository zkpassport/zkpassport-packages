use aztec::protocol::address::AztecAddress;
use aztec::protocol::traits::FromField;
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

#[test(should_fail_with = "unknown registry id")]
fn rejects_unknown_registry_id() {
    assert_valid_registry_id(0);
}

#[test(should_fail_with = "caller is not admin or oracle")]
fn rejects_sender_that_is_neither_admin_nor_oracle() {
    let admin = AztecAddress::from_field(1);
    let oracle = AztecAddress::from_field(2);
    let sender = AztecAddress::from_field(3);
    assert_admin_or_oracle(sender, admin, oracle);
}
