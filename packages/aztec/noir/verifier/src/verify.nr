use aztec::{
    context::PrivateContext,
    oracle::capsules,
    protocol::{address::AztecAddress, hash::sha256_to_field},
};
use poseidon::poseidon2::Poseidon2;
use zkpassport::commitments::disclose_commitment;
use zkpassport::constants::{
    CURRENT_DATE_MAX_SKEW, DISCLOSE_CAPSULE_SLOT, PROOF_CAPSULE_SLOT, PROOF_FIELDS, VK_FIELDS,
};
use zkpassport::verify::verify_outer_proof_core;
use zkpassport_registry_contract::ZKPassportRegistry;

pub struct ServiceConfig {
    // Circuit-manifest version this app accepts (the registry keys vks by it). Convention:
    // CircuitManifest.version packed as 2-byte BE major/minor/patch, left-aligned bytes32 —
    // the same encoding the ZKPassport SDK sends as L1's params.version.
    pub version: Field,
    pub scope: Field, // sha256(domain) >> 8, app-computed constant (0 if unused)
    pub subscope: Field, // sha256(scope) >> 8 (0 if unused)
    pub validity_period: u64, // max proof age in seconds
    pub dev_mode: bool,
    pub disclose: bool, // the proof has a disclose subproof, its payload in the disclose capsule
}

/// The payload of a disclose subproof: which of the 90 MRZ bytes are disclosed, and the bytes.
pub struct Disclosure {
    pub mask: [bool; 90],
    pub bytes: [u8; 90],
}

pub struct VerifiedProof<let K: u32> {
    pub scoped_nullifier: Field,
    pub nullifier_type: u8,
    pub current_date: u64,
    pub param_commitments: [Field; K - 3],
    pub disclosure: Option<Disclosure>, // some exactly when ServiceConfig.disclose is set
}

// Domain separator for the uniqueness nullifier.
pub global UNIQUENESS_NULLIFIER_DOMAIN: Field =
    sha256_to_field("ZKPASSPORT::AZTEC::UNIQUENESS_NULLIFIER".as_bytes());

/// Verify a zkPassport outer proof end-to-end: capsule load, recursion, scope pin, nullifier
/// policy, commitment coverage, freshness, and the one registry view (roots + vk + OPRF).
///
/// `capsule_scope` is the PXE account scope the proof capsule was delivered under — the
/// transaction sender (`msg_sender`), not necessarily the subject of the proof. It only
/// selects where the capsule is read from; nothing about the proof's validity depends on it.
/// To tie the proof to an address, put `bind_user_address_commitment(address)` in
/// `expected_commitments`.
///
/// `expected_commitments` are the param commitments of the subproofs the app asks for (age,
/// bind, ...). With `config.disclose`, the library loads the disclose payload from the disclose
/// capsule and adds its commitment itself, so the app passes one fewer and reads the disclosed
/// bytes from `VerifiedProof.disclosure`, the only copy the proof covers. The full list must
/// match the proof's K - 3 param commitments as a multiset (any order): the prover does not fix
/// the subproof order and the ZKPassport SDK itself matches param commitments by membership, so
/// e.g. a {constraint, bind} pair may arrive in either order.
pub fn verify_zkpassport_proof<let K: u32>(
    context: &mut PrivateContext,
    registry: AztecAddress,
    capsule_scope: AztecAddress,
    config: ServiceConfig,
    expected_commitments: BoundedVec<Field, K - 3>,
) -> VerifiedProof<K> {
    // Capsule load is unconstrained oracle data, everything downstream constrains it (as it must).
    // Safety: the loaded blob is untrusted input; verify_outer_proof_core and the freshness/
    // registry checks below constrain every field derived from it.
    let blob: Option<[Field; VK_FIELDS + PROOF_FIELDS + K + 5]> =
        unsafe { capsules::load(context.this_address(), PROOF_CAPSULE_SLOT, capsule_scope) };

    assert(blob.is_some(), "missing zkpassport proof capsule");

    let blob = blob.unwrap();

    let mut vk = [0; VK_FIELDS];
    for i in 0..VK_FIELDS {
        vk[i] = blob[i];
    }

    let mut proof = [0; PROOF_FIELDS];
    for i in 0..PROOF_FIELDS {
        proof[i] = blob[VK_FIELDS + i];
    }

    let mut public_inputs = [0; K + 5];
    for i in 0..K + 5 {
        public_inputs[i] = blob[VK_FIELDS + PROOF_FIELDS + i];
    }

    // The disclose payload is loaded once, here: a second load is a separate oracle call the
    // sender's PXE can answer differently, so only this copy is bound to the proof.
    let disclosure = if config.disclose {
        Option::some(load_disclosure(context.this_address(), capsule_scope))
    } else {
        Option::none()
    };

    // Stateless core: recursion, scope, nullifier policy, multiset commitment coverage.
    let out = verify_outer_proof_core::<K>(
        vk,
        proof,
        public_inputs,
        config.scope,
        config.subscope,
        config.dev_mode,
        expected_with_disclosure::<K>(expected_commitments, disclosure),
    );
    let parsed = out.parsed;

    // Freshness vs the anchor-block timestamp
    let anchor_ts = context.get_anchor_block_header().timestamp();
    assert(parsed.current_date <= anchor_ts + CURRENT_DATE_MAX_SKEW, "proof dated in the future");
    assert(parsed.current_date + config.validity_period > anchor_ts, "proof too old");

    // Registry view call to verify roots + vk acceptance + OPRF
    ZKPassportRegistry::at(registry)
        .assert_proof_valid(
            config.version,
            out.vk_hash,
            parsed.certificate_registry_root,
            parsed.circuit_registry_root,
            parsed.current_date,
            parsed.nullifier_type,
            parsed.oprf_pk_hash,
        )
        .view(context);

    VerifiedProof {
        scoped_nullifier: parsed.scoped_nullifier,
        nullifier_type: parsed.nullifier_type,
        current_date: parsed.current_date,
        param_commitments: parsed.param_commitments,
        disclosure,
    }
}

/// Sanctions check: asserts the sanctions root is valid in the registry, and returns the param commitment the
/// caller must add to its expected_commitments, binding the checked root to the proof.
pub fn check_sanctions(
    context: &mut PrivateContext,
    registry: AztecAddress,
    root: Field,
    is_strict: bool,
    current_date: u64,
) -> Field {
    ZKPassportRegistry::at(registry).assert_sanctions_root_valid(root, current_date).view(context);
    zkpassport::commitments::sanctions_commitment(root, is_strict)
}

/// One-proof-per-passport-per-service: pushes a domain-separated nullifier derived from the
/// scoped nullifier. Siloed per app contract by the kernel → per-app uniqueness.
pub fn emit_uniqueness_nullifier(context: &mut PrivateContext, scoped_nullifier: Field) {
    // zkpassport::verify's "zero scoped nullifier" assert exempts a hidden nullifier
    // (NULLIFIER_TYPE_NONE, or a mock type in dev mode), so a zero nullifier CAN reach here.
    // This is where it actually matters: pushing it would burn one single global nullifier slot
    // and permanently block every future caller of this function, in every app, for the rest of
    // time.
    assert(scoped_nullifier != 0, "no nullifier in this proof");
    context.push_nullifier_unsafe(Poseidon2::hash(
        [UNIQUENESS_NULLIFIER_DOMAIN, scoped_nullifier],
        2,
    ));
}

fn load_disclosure(app: AztecAddress, capsule_scope: AztecAddress) -> Disclosure {
    // Safety: the loaded payload is untrusted input; parse_disclose_payload range-constrains
    // every element, and the caller's commitment check binds the result to the proof.
    let payload: Option<[Field; 180]> =
        unsafe { capsules::load(app, DISCLOSE_CAPSULE_SLOT, capsule_scope) };

    assert(payload.is_some(), "missing disclose capsule");
    parse_disclose_payload(payload.unwrap())
}

// The capsule holds mask ‖ bytes, one value per Field. Field-to-integer casts truncate silently,
// so every element is range-checked.
fn parse_disclose_payload(payload: [Field; 180]) -> Disclosure {
    let mut mask = [false; 90];
    let mut bytes = [0 as u8; 90];
    for i in 0..90 {
        assert((payload[i] == 0) | (payload[i] == 1), "mask element not a bit");
        mask[i] = payload[i] == 1;
        let b = payload[90 + i] as u8;
        assert(b as Field == payload[90 + i], "disclosed byte out of range");
        bytes[i] = b;
    }

    Disclosure { mask, bytes }
}

fn expected_with_disclosure<let K: u32>(
    expected_commitments: BoundedVec<Field, K - 3>,
    disclosure: Option<Disclosure>,
) -> [Field; K - 3] {
    let added = if disclosure.is_some() { 1 } else { 0 };
    assert(expected_commitments.len() + added == K - 3, "wrong number of expected commitments");

    let mut expected = expected_commitments;
    if disclosure.is_some() {
        let disclosure = disclosure.unwrap();
        expected.push(disclose_commitment(disclosure.mask, disclosure.bytes));
    }

    expected.storage()
}

mod test {
    use crate::verify::{Disclosure, expected_with_disclosure, parse_disclose_payload};
    use zkpassport::fixtures::DISCLOSE_COMMITMENT;

    // The conformance disclose payload: a TD3 mask disclosing only the nationality, "AUS"
    fn nationality_payload() -> [Field; 180] {
        let mut payload = [0; 180];
        payload[54] = 1;
        payload[55] = 1;
        payload[56] = 1;
        payload[90 + 54] = 65;
        payload[90 + 55] = 85;
        payload[90 + 56] = 83;
        payload
    }

    #[test]
    fn payload_parses_into_mask_and_bytes() {
        let disclosure = parse_disclose_payload(nationality_payload());
        assert(disclosure.mask[54] & disclosure.mask[55] & disclosure.mask[56]);
        assert(!disclosure.mask[53] & !disclosure.mask[57]);
        assert(
            [disclosure.bytes[54], disclosure.bytes[55], disclosure.bytes[56]] == "AUS".as_bytes(),
        );
    }

    #[test(should_fail_with = "mask element not a bit")]
    fn mask_element_not_a_bit_rejected() {
        let mut payload = nationality_payload();
        payload[54] = 2;
        let _ = parse_disclose_payload(payload);
    }

    #[test(should_fail_with = "disclosed byte out of range")]
    fn disclosed_byte_out_of_range_rejected() {
        let mut payload = nationality_payload();
        payload[90 + 54] = 256;
        let _ = parse_disclose_payload(payload);
    }

    #[test]
    fn disclose_commitment_completes_the_expected_list() {
        let disclosure = parse_disclose_payload(nationality_payload());
        let expected = expected_with_disclosure::<5>(
            BoundedVec::from_array([0x1234]),
            Option::some(disclosure),
        );
        assert(expected == [0x1234, DISCLOSE_COMMITMENT]);
    }

    #[test]
    fn full_expected_list_passes_without_disclosure() {
        let expected = expected_with_disclosure::<5>(
            BoundedVec::from_array([0x1234, 0x5678]),
            Option::<Disclosure>::none(),
        );
        assert(expected == [0x1234, 0x5678]);
    }

    #[test(should_fail_with = "wrong number of expected commitments")]
    fn short_expected_list_rejected() {
        let _ = expected_with_disclosure::<5>(
            BoundedVec::from_array([0x1234]),
            Option::<Disclosure>::none(),
        );
    }

    #[test(should_fail_with = "wrong number of expected commitments")]
    fn short_expected_list_with_disclosure_rejected() {
        let disclosure = parse_disclose_payload(nationality_payload());
        let _ = expected_with_disclosure::<6>(
            BoundedVec::from_array([0x1234]),
            Option::some(disclosure),
        );
    }

    #[test(should_fail_with = "wrong number of expected commitments")]
    fn full_expected_list_with_disclosure_rejected() {
        let disclosure = parse_disclose_payload(nationality_payload());
        let _ = expected_with_disclosure::<5>(
            BoundedVec::from_array([0x1234, 0x5678]),
            Option::some(disclosure),
        );
    }
}
