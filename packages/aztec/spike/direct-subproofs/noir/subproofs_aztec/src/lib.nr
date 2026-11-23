//! Reads `verify_zkpassport_subproofs`'s inputs from the calling contract's capsules.
use aztec::{context::PrivateContext, oracle::capsules, protocol::address::AztecAddress};
use zkpassport_subproofs::types::{
    CSC_TO_DSC_FIELDS, DISCLOSURE_FIELDS, DSC_TO_ID_DATA_FIELDS, INTEGRITY_CHECK_FIELDS,
    OUTER_PUBLIC_INPUTS_BASE, OuterPublicInputs, Subproof, Subproofs,
};

/// The first slot: the outer public inputs, then one slot per subproof in proving order.
pub global SUBPROOFS_CAPSULE_SLOT: Field = 10;

/// Loads the outer public inputs (`L` = N + 9 fields) and the N + 3 subproofs from this contract's
/// capsules under `scope`. Unconstrained input: `verify_zkpassport_subproofs` constrains all of it.
pub fn load_subproofs<let N: u32, let L: u32>(
    context: &mut PrivateContext,
    scope: AztecAddress,
) -> Subproofs<N> {
    assert(L == N + OUTER_PUBLIC_INPUTS_BASE, "wrong outer public inputs length");
    let header: [Field; L] = load(context, scope, SUBPROOFS_CAPSULE_SLOT);
    let csc: [Field; CSC_TO_DSC_FIELDS] = load(context, scope, SUBPROOFS_CAPSULE_SLOT + 1);
    let dsc: [Field; DSC_TO_ID_DATA_FIELDS] = load(context, scope, SUBPROOFS_CAPSULE_SLOT + 2);
    let integrity: [Field; INTEGRITY_CHECK_FIELDS] =
        load(context, scope, SUBPROOFS_CAPSULE_SLOT + 3);
    let mut disclosure_proofs = [Subproof::from_fields([0; DISCLOSURE_FIELDS]); N];
    for i in 0..N {
        let fields: [Field; DISCLOSURE_FIELDS] =
            load(context, scope, SUBPROOFS_CAPSULE_SLOT + 4 + i as Field);
        disclosure_proofs[i] = Subproof::from_fields(fields);
    }
    Subproofs {
        public_inputs: OuterPublicInputs::from_fields(header),
        csc_to_dsc_proof: Subproof::from_fields(csc),
        dsc_to_id_data_proof: Subproof::from_fields(dsc),
        integrity_check_proof: Subproof::from_fields(integrity),
        disclosure_proofs,
    }
}

fn load<let L: u32>(context: &mut PrivateContext, scope: AztecAddress, slot: Field) -> [Field; L] {
    // Safety: the caller's verify_zkpassport_subproofs constrains every field read here.
    let fields: Option<[Field; L]> =
        unsafe { capsules::load(context.this_address(), slot, scope) };
    assert(fields.is_some(), "missing subproof capsule");
    fields.unwrap()
}
