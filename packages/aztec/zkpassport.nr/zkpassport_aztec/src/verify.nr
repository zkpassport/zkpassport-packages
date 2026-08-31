use aztec::{context::PrivateContext, oracle::capsules, protocol::address::AztecAddress};
use poseidon::poseidon2::Poseidon2;
use zkpassport_core::constants::{
    CURRENT_DATE_MAX_SKEW, DISCLOSE_CAPSULE_SLOT, PROOF_CAPSULE_SLOT, PROOF_FIELDS, VK_FIELDS,
};
use zkpassport_core::verify::verify_outer_proof_core;
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
}

pub struct VerifiedProof<let K: u32> {
    pub scoped_nullifier: Field,
    pub nullifier_type: u8,
    pub current_date: u64,
    pub param_commitments: [Field; K - 3],
}

// Domain separator for the uniqueness nullifier:
// sha256("ZKPASSPORT::AZTEC::UNIQUENESS_NULLIFIER") >> 8 (truncated to fit a Field).
pub global UNIQUENESS_NULLIFIER_DOMAIN: Field =
    0x00b78b155d07e57bd0637b4da6434036916f508469fbf665bc45642faef0baed;

/// Verify a zkPassport outer proof end-to-end: capsule load, recursion, scope pin, nullifier
/// policy, commitment coverage, freshness, and the one registry view (roots + vk + OPRF).
///
/// `capsule_scope` is the PXE account scope the proof capsule was delivered under — the
/// transaction sender (`msg_sender`), not necessarily the subject of the proof. It only
/// selects where the capsule is read from; nothing about the proof's validity depends on it.
/// To tie the proof to an address, put `bind_user_address_commitment(address)` in
/// `expected_commitments`.
///
/// `expected_commitments` are matched as a multiset (any order, full coverage — see
/// verify_outer_proof_core): the prover does not fix the subproof order and the ZKPassport SDK
/// itself matches param commitments by membership, so e.g. a {constraint, bind} pair may
/// arrive in either order.
pub fn verify_zkpassport_proof<let K: u32>(
    context: &mut PrivateContext,
    registry: AztecAddress,
    capsule_scope: AztecAddress,
    config: ServiceConfig,
    expected_commitments: [Field; K - 3],
) -> VerifiedProof<K> {
    // 1. Capsule load — unconstrained oracle data; EVERYTHING downstream constrains it.
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

    // 2-6. Stateless core: recursion, scope, nullifier policy, multiset commitment coverage.
    let out = verify_outer_proof_core::<K>(
        vk,
        proof,
        public_inputs,
        config.scope,
        config.subscope,
        config.dev_mode,
        expected_commitments,
    );
    let parsed = out.parsed;

    // 7. Freshness vs the anchor-block timestamp (private functions have no "now" — spec §library.5)
    let anchor_ts = context.get_anchor_block_header().timestamp();
    assert(parsed.current_date <= anchor_ts + CURRENT_DATE_MAX_SKEW, "proof dated in the future");
    assert(parsed.current_date + config.validity_period > anchor_ts, "proof too old");

    // 8. One registry view call: roots + vk acceptance + OPRF, all under the registry's DPM reads.
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
    }
}

/// Load the disclose payload (mask ‖ bytes, one value per Field) from the app's capsule slot 2.
/// Range-constrains every element (Field→int casts truncate silently in Noir).
pub fn load_disclose_payload(
    app: AztecAddress,
    capsule_scope: AztecAddress,
) -> ([bool; 90], [u8; 90]) {
    // Safety: the loaded tail is untrusted input; every element is range-constrained below
    // before being used as a bit or byte.
    let tail: Option<[Field; 180]> =
        unsafe { capsules::load(app, DISCLOSE_CAPSULE_SLOT, capsule_scope) };
    assert(tail.is_some(), "missing disclose capsule");
    let tail = tail.unwrap();
    let mut mask = [false; 90];
    let mut bytes = [0 as u8; 90];
    for i in 0..90 {
        assert((tail[i] == 0) | (tail[i] == 1), "mask element not a bit");
        mask[i] = tail[i] == 1;
        let b = tail[90 + i] as u8;
        assert(b as Field == tail[90 + i], "disclosed byte out of range");
        bytes[i] = b;
    }
    (mask, bytes)
}

/// Opt-in sanctions check (spec decision #4): asserts the sanctions root (delivered by the app,
/// typically from capsule slot 3) is valid in the registry, and returns the param commitment the
/// caller must place in its expected_commitments slot — binding the checked root to the proof.
pub fn check_sanctions(
    context: &mut PrivateContext,
    registry: AztecAddress,
    root: Field,
    is_strict: bool,
    current_date: u64,
) -> Field {
    ZKPassportRegistry::at(registry).assert_sanctions_root_valid(root, current_date).view(context);
    zkpassport_core::commitments::sanctions_commitment(root, is_strict)
}

/// One-proof-per-passport-per-service: pushes a domain-separated nullifier derived from the
/// scoped nullifier. Siloed per app contract by the kernel → per-app uniqueness.
pub fn emit_uniqueness_nullifier(context: &mut PrivateContext, scoped_nullifier: Field) {
    // zkpassport_core::verify's "zero scoped nullifier" assert exempts NULLIFIER_TYPE_NONE (no uniqueness
    // requested), so a zero nullifier CAN reach here. This is where it actually matters: pushing
    // it would burn one single global nullifier slot and permanently block every future caller
    // of this function, in every app, for the rest of time. Guard here, not in zkpassport_core.
    assert(scoped_nullifier != 0, "no nullifier in this proof");
    context.push_nullifier_unsafe(Poseidon2::hash(
        [UNIQUENESS_NULLIFIER_DOMAIN, scoped_nullifier],
        2,
    ));
}
