use crate::constants::{
    PI_CERT_ROOT, PI_CIRCUIT_ROOT, PI_CURRENT_DATE, PI_PARAMS_START, PI_SCOPE, PI_SUBSCOPE,
};

pub struct PublicInputs<let K: u32> {
    pub certificate_registry_root: Field,
    pub circuit_registry_root: Field,
    pub current_date: u64,
    pub service_scope: Field,
    pub service_subscope: Field,
    pub param_commitments: [Field; K - 3],
    pub nullifier_type: u8,
    pub scoped_nullifier: Field,
    pub oprf_pk_hash: Field,
}

pub fn parse_public_inputs<let K: u32>(public_inputs: [Field; K + 5]) -> PublicInputs<K> {
    let current_date_f = public_inputs[PI_CURRENT_DATE];
    let current_date = current_date_f as u64;
    assert(current_date as Field == current_date_f, "current_date out of range");

    let nullifier_type_f = public_inputs[K + 5 - 3];
    let nullifier_type = nullifier_type_f as u8;
    assert(nullifier_type as Field == nullifier_type_f, "nullifier_type out of range");

    let mut param_commitments = [0; K - 3];
    for i in 0..K - 3 {
        param_commitments[i] = public_inputs[PI_PARAMS_START + i];
    }

    PublicInputs {
        certificate_registry_root: public_inputs[PI_CERT_ROOT],
        circuit_registry_root: public_inputs[PI_CIRCUIT_ROOT],
        current_date,
        service_scope: public_inputs[PI_SCOPE],
        service_subscope: public_inputs[PI_SUBSCOPE],
        param_commitments,
        nullifier_type,
        scoped_nullifier: public_inputs[K + 5 - 2],
        oprf_pk_hash: public_inputs[K + 5 - 1],
    }
}

pub mod test {
    use crate::parse::parse_public_inputs;

    pub global FIXTURE_PIS: [Field; 9] = [
        0x0b0c92d05628ecf182329c3196082f4dd9ce3f56f56588c9d7980092a09da0b3, // cert root
        0x028840d451e834f298e5a898a80f8fbfe9ea6605454a17c83d00a8b79d55753c, // circuit root
        0x000000000000000000000000000000000000000000000000000000006a82e6c9, // current_date
        0x0000000000000000000000000000000000000000000000000000000000000000, // scope
        0x0000000000000000000000000000000000000000000000000000000000000000, // subscope
        0x2613e86d681964f7da622ce30ca7bddabf0ec50a6a46dda1ccf7ffa4173471ba, // param_commitments[0]
        0x0000000000000000000000000000000000000000000000000000000000000000, // nullifier_type
        0x05dc3bf920696c5869f372f66f4a0f940ebf701020c8921a933ebcd102b6aa8f, // scoped_nullifier
        0x0000000000000000000000000000000000000000000000000000000000000000, // oprf_pk_hash
    ];

    #[test]
    fn parses_outer_count_4_fixture() {
        let p = parse_public_inputs::<4>(FIXTURE_PIS);
        assert(p.certificate_registry_root == FIXTURE_PIS[0]);
        assert(p.circuit_registry_root == FIXTURE_PIS[1]);
        assert(p.current_date == 1786963657);
        assert(p.service_scope == 0);
        assert(p.service_subscope == 0);
        assert(p.param_commitments[0] == FIXTURE_PIS[5]);
        assert(p.nullifier_type == 0);
        assert(p.scoped_nullifier == FIXTURE_PIS[7]);
        assert(p.oprf_pk_hash == 0);
    }

    #[test(should_fail_with = "current_date out of range")]
    fn overflowing_current_date_rejected() {
        let mut pis = FIXTURE_PIS;
        pis[2] = 0x10000000000000000; // 2^64
        let _ = parse_public_inputs::<4>(pis);
    }
}
