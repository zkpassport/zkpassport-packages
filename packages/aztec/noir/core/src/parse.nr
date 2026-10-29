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

mod test {
    use crate::fixtures::FIXTURE_PUBLIC_INPUTS;
    use crate::parse::parse_public_inputs;

    #[test]
    fn parses_outer_count_4_fixture() {
        let p = parse_public_inputs::<4>(FIXTURE_PUBLIC_INPUTS);
        assert(p.certificate_registry_root == FIXTURE_PUBLIC_INPUTS[0]);
        assert(p.circuit_registry_root == FIXTURE_PUBLIC_INPUTS[1]);
        assert(p.current_date == 2524608000);
        assert(p.service_scope == 0);
        assert(p.service_subscope == 0);
        assert(p.param_commitments[0] == FIXTURE_PUBLIC_INPUTS[5]);
        assert(p.nullifier_type == 0);
        assert(p.scoped_nullifier == FIXTURE_PUBLIC_INPUTS[7]);
        assert(p.oprf_pk_hash == 0);
    }

    #[test(should_fail_with = "current_date out of range")]
    fn overflowing_current_date_rejected() {
        let mut pis = FIXTURE_PUBLIC_INPUTS;
        pis[2] = 0x10000000000000000; // 2^64
        let _ = parse_public_inputs::<4>(pis);
    }
}
