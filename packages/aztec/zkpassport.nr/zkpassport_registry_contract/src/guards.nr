use crate::types::{REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT, REGISTRY_SANCTIONS};
use aztec::protocol::address::AztecAddress;

pub fn assert_valid_registry_id(registry_id: Field) {
    let ok = (registry_id == REGISTRY_CERTIFICATE)
        | (registry_id == REGISTRY_CIRCUIT)
        | (registry_id == REGISTRY_SANCTIONS);
    assert(ok, "unknown registry id");
}

pub fn assert_admin(sender: AztecAddress, admin: AztecAddress) {
    assert(sender == admin, "caller is not admin");
}

pub fn assert_admin_or_oracle(sender: AztecAddress, admin: AztecAddress, oracle: AztecAddress) {
    assert((sender == admin) | (sender == oracle), "caller is not admin or oracle");
}

pub fn assert_address_not_zero<let N: u32>(address: AztecAddress, msg: str<N>) {
    assert(!address.is_zero(), msg);
}

mod test {
    use super::{
        assert_address_not_zero, assert_admin, assert_admin_or_oracle, assert_valid_registry_id,
    };
    use aztec::protocol::address::AztecAddress;
    use aztec::protocol::traits::FromField;

    #[test(should_fail_with = "admin cannot be zero address")]
    fn rejects_zero_address() {
        assert_address_not_zero(AztecAddress::zero(), "admin cannot be zero address");
    }

    #[test(should_fail_with = "unknown registry id")]
    fn rejects_unknown_registry_id() {
        assert_valid_registry_id(0);
    }

    #[test(should_fail_with = "caller is not admin")]
    fn rejects_non_admin_sender() {
        let admin = AztecAddress::from_field(1);
        let sender = AztecAddress::from_field(2);
        assert_admin(sender, admin);
    }

    #[test(should_fail_with = "caller is not admin or oracle")]
    fn rejects_sender_that_is_neither_admin_nor_oracle() {
        let admin = AztecAddress::from_field(1);
        let oracle = AztecAddress::from_field(2);
        let sender = AztecAddress::from_field(3);
        assert_admin_or_oracle(sender, admin, oracle);
    }
}
