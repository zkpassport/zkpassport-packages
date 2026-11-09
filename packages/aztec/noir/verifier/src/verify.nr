use aztec::{
    context::PrivateContext,
    oracle::capsules,
    protocol::{address::AztecAddress, hash::sha256_to_field, traits::FromField},
};
use poseidon::poseidon2::Poseidon2;
use zkpassport::commitments::disclose_commitment;
use zkpassport::constants::{
    CURRENT_DATE_MAX_SKEW, DISCLOSE_CAPSULE_SLOT, NULLIFIER_TYPE_NON_SALTED,
    NULLIFIER_TYPE_NON_SALTED_MOCK, NULLIFIER_TYPE_NONE, NULLIFIER_TYPE_SALTED,
    NULLIFIER_TYPE_SALTED_MOCK, PROOF_CAPSULE_SLOT, PROOF_FIELDS, VK_FIELDS,
};
use zkpassport::verify::verify_outer_proof_core;
use zkpassport_registry_contract::{
    local_network_registry::LOCAL_NETWORK_REGISTRY_ADDRESS, ZKPassportRegistry,
};

pub struct ServiceConfig {
    // Circuit-manifest version this app accepts (the registry keys vks by it). Convention:
    // CircuitManifest.version packed as 2-byte BE major/minor/patch, left-aligned bytes32 —
    // the same encoding the ZKPassport SDK sends as L1's params.version.
    pub version: Field,
    pub domain: Field, // scope_hash of the domain the app's requests come from, never 0
    pub scope: Field, // scope_hash of a scope within the domain, 0 for the whole domain
    pub unique_identifier_type: u8, // the real NULLIFIER_TYPE_* the proof must carry
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
    pub unique_identifier: Field,
    pub current_date: u64,
    pub param_commitments: [Field; K - 3],
    pub disclosure: Option<Disclosure>, // some exactly when ServiceConfig.disclose is set
}

// Domain separator for the uniqueness nullifier.
global UNIQUENESS_NULLIFIER_DOMAIN: Field =
    sha256_to_field("ZKPASSPORT::AZTEC::UNIQUENESS_NULLIFIER".as_bytes());

// The L1 chain id and the rollup version TXE reports.
global TXE_CHAIN_ID: Field = 1;
global TXE_VERSION: Field = 1;

// Anvil's default chain id, the L1 of an Aztec local network.
global ANVIL_CHAIN_ID: Field = 31337;

// The L1 chain id and the rollup version of the Aztec testnet, and ZKPassport's registry on it.
global TESTNET_CHAIN_ID: Field = 11155111;
global TESTNET_VERSION: Field = 679261766;
global TESTNET_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x019de2b2c83e178733dce20707949a17ec3465caba6ccd24b3d861f151bf0f30,
);

// ZKPassport's registry deployments, as (chain id, version, registry address) tuples.
// Chain id refers to the L1 the network settles on and version to the network's rollup.
// A version of none matches every version on that chain.
global REGISTRY_DEPLOYMENTS: [(Field, Option<Field>, AztecAddress); 3] = [
    (TXE_CHAIN_ID, Option::some(TXE_VERSION), LOCAL_NETWORK_REGISTRY_ADDRESS),
    // A local network, at any rollup version: Anvil's chain id is never a live network's
    (ANVIL_CHAIN_ID, Option::none(), LOCAL_NETWORK_REGISTRY_ADDRESS),
    (TESTNET_CHAIN_ID, Option::some(TESTNET_VERSION), TESTNET_REGISTRY_ADDRESS),
];

/// Hashes a domain or scope string the way the ZKPassport SDK does, for `ServiceConfig`.
///
/// The empty string hashes to 0. Call it in a global so the hash is computed at compile time:
/// `global DOMAIN: Field = scope_hash("example.com");`
pub fn scope_hash<let N: u32>(value: str<N>) -> Field {
    if N == 0 {
        0
    } else {
        // sha256 truncated to its first 31 bytes, as getScopeHash in @zkpassport/utils
        sha256_to_field(value.as_bytes())
    }
}

/// Verify a zkPassport outer proof end-to-end, against ZKPassport's registry on this network.
///
/// `capsule_scope` is the PXE account scope the proof capsule was delivered under. Consider the
/// transaction sender (`msg_sender`) is not necessarily the subject of the proof. It only
/// selects where the capsule is read from, nothing about the proof's validity depends on it.
///
/// To tie the proof to an address, put `bind_user_address_commitment(address)` in
/// `expected_commitments`.
///
/// `expected_commitments` are the param commitments of the subproofs the app asks for (age,
/// bind, ...).
///
/// With `config.disclose`, the library loads the disclose payload from the disclose
/// capsule and adds its commitment itself.
///
/// In TXE and on a local network this is the local network registry, see
/// `zkpassport_registry_contract::local_network_registry`. Use
/// `verify_zkpassport_proof_with_registry` on a network without a ZKPassport registry.
pub fn verify_zkpassport_proof<let K: u32>(
    context: &mut PrivateContext,
    capsule_scope: AztecAddress,
    config: ServiceConfig,
    expected_commitments: BoundedVec<Field, K - 3>,
) -> VerifiedProof<K> {
    let registry = default_registry(context.chain_id(), context.version());
    verify_zkpassport_proof_with_registry(
        context,
        registry,
        capsule_scope,
        config,
        expected_commitments,
    )
}

/// `verify_zkpassport_proof` against the registry at `registry`.
///
/// For a network without a ZKPassport registry, such as a local network or TXE tests, or an app
/// that trusts a registry of its own.
pub fn verify_zkpassport_proof_with_registry<let K: u32>(
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
        // Safety: the loaded payload is untrusted input; parse_disclose_payload range-constrains
        // every element, and expected_with_disclosure's commitment binds the result to the proof.
        let payload: Option<[Field; 180]> =
            unsafe { capsules::load(context.this_address(), DISCLOSE_CAPSULE_SLOT, capsule_scope) };

        assert(payload.is_some(), "missing disclose capsule");
        Option::some(parse_disclose_payload(payload.unwrap()))
    } else {
        Option::none()
    };

    // Stateless core: recursion, domain and scope, nullifier policy, multiset commitment coverage.
    let out = verify_outer_proof_core::<K>(
        vk,
        proof,
        public_inputs,
        config.domain,
        config.scope,
        config.dev_mode,
        expected_with_disclosure::<K>(expected_commitments, disclosure),
    );
    let parsed = out.parsed;

    assert_service_policy(config, parsed.nullifier_type, parsed.scoped_nullifier);

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
        unique_identifier: parsed.scoped_nullifier,
        current_date: parsed.current_date,
        param_commitments: parsed.param_commitments,
        disclosure,
    }
}

/// Sanctions check: asserts the sanctions root is valid in ZKPassport's registry on this
/// network, and returns the param commitment the caller must add to its expected_commitments,
/// binding the checked root to the proof.
///
/// In TXE and on a local network this is the local network registry, see
/// `zkpassport_registry_contract::local_network_registry`. Use `check_sanctions_with_registry` on a
/// network without a ZKPassport registry.
pub fn check_sanctions(
    context: &mut PrivateContext,
    root: Field,
    is_strict: bool,
    current_date: u64,
) -> Field {
    let registry = default_registry(context.chain_id(), context.version());
    check_sanctions_with_registry(context, registry, root, is_strict, current_date)
}

/// `check_sanctions` against the registry at `registry`.
pub fn check_sanctions_with_registry(
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
/// unique identifier. Siloed per app contract by the kernel → per-app uniqueness.
pub fn emit_uniqueness_nullifier(context: &mut PrivateContext, unique_identifier: Field) {
    // zkpassport::verify's "zero scoped nullifier" assert exempts a hidden nullifier
    // (NULLIFIER_TYPE_NONE, or a mock type in dev mode), so a zero identifier CAN reach here.
    // This is where it actually matters: pushing it would burn one single global nullifier slot
    // and permanently block every future caller of this function, in every app, for the rest of
    // time.
    assert(unique_identifier != 0, "no unique identifier in this proof");
    context.push_nullifier_unsafe(Poseidon2::hash(
        [UNIQUENESS_NULLIFIER_DOMAIN, unique_identifier],
        2,
    ));
}

pub(crate) fn default_registry(chain_id: Field, version: Field) -> AztecAddress {
    let mut registry = Option::none();
    for deployment in REGISTRY_DEPLOYMENTS {
        let (deployment_chain_id, deployment_version, address) = deployment;
        let version_matches =
            deployment_version.is_none() | (deployment_version.unwrap_unchecked() == version);
        if (deployment_chain_id == chain_id) & version_matches {
            registry = Option::some(address);
        }
    }

    assert(registry.is_some(), "no default ZKPassport registry on this network");
    registry.unwrap()
}

// The checks this library adds to the core's. A proof made for no domain (0) would pass in every
// app that also left it at 0, with the same unique identifier in each.
fn assert_service_policy(
    config: ServiceConfig,
    unique_identifier_type: u8,
    unique_identifier: Field,
) {
    assert(config.domain != 0, "service domain required");
    assert(
        real_unique_identifier_type(unique_identifier_type, unique_identifier)
            == config.unique_identifier_type,
        "wrong unique identifier type",
    );
}

// A mock document's proof counts as the real type it mocks. A non-salted mock keeps its type even
// when the identifier is hidden, so a hidden one counts as NULLIFIER_TYPE_NONE.
fn real_unique_identifier_type(unique_identifier_type: u8, unique_identifier: Field) -> u8 {
    if unique_identifier_type == NULLIFIER_TYPE_SALTED_MOCK {
        NULLIFIER_TYPE_SALTED
    } else if unique_identifier_type == NULLIFIER_TYPE_NON_SALTED_MOCK {
        if unique_identifier != 0 {
            NULLIFIER_TYPE_NON_SALTED
        } else {
            NULLIFIER_TYPE_NONE
        }
    } else {
        unique_identifier_type
    }
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
    use crate::verify::{
        ANVIL_CHAIN_ID, assert_service_policy, default_registry, Disclosure,
        expected_with_disclosure, parse_disclose_payload, scope_hash, ServiceConfig,
        TESTNET_CHAIN_ID, TESTNET_REGISTRY_ADDRESS, TESTNET_VERSION, TXE_CHAIN_ID, TXE_VERSION,
    };
    use aztec::test::helpers::test_environment::TestEnvironment;
    use zkpassport::constants::{
        NULLIFIER_TYPE_NON_SALTED, NULLIFIER_TYPE_NON_SALTED_MOCK, NULLIFIER_TYPE_NONE,
        NULLIFIER_TYPE_SALTED, NULLIFIER_TYPE_SALTED_MOCK,
    };
    use zkpassport::fixtures::DISCLOSE_COMMITMENT;
    use zkpassport_registry_contract::local_network_registry::{
        deploy_local_network_registry, LOCAL_NETWORK_REGISTRY_ADDRESS,
    };

    fn service_config(domain: Field, unique_identifier_type: u8) -> ServiceConfig {
        ServiceConfig {
            version: 0,
            domain,
            scope: 0,
            unique_identifier_type,
            validity_period: 86400,
            dev_mode: false,
            disclose: false,
        }
    }

    #[test]
    fn scope_hash_matches_the_sdk() {
        // getServiceScopeHash("example.com") in @zkpassport/utils
        assert(
            scope_hash("example.com")
                == 0x00a379a6f6eeafb9a55e378c118034e2751e682fab9f2d30ab13d2125586ce19,
        );
    }

    #[test]
    fn scope_hash_of_empty_string_is_zero() {
        assert(scope_hash("") == 0);
    }

    #[test]
    fn service_policy_passes_for_a_domain_and_matching_type() {
        assert_service_policy(
            service_config(scope_hash("example.com"), NULLIFIER_TYPE_NON_SALTED),
            NULLIFIER_TYPE_NON_SALTED,
            1,
        );
    }

    #[test(should_fail_with = "service domain required")]
    fn service_without_domain_rejected() {
        assert_service_policy(
            service_config(0, NULLIFIER_TYPE_NON_SALTED),
            NULLIFIER_TYPE_NON_SALTED,
            1,
        );
    }

    #[test(should_fail_with = "wrong unique identifier type")]
    fn wrong_unique_identifier_type_rejected() {
        assert_service_policy(
            service_config(scope_hash("example.com"), NULLIFIER_TYPE_SALTED),
            NULLIFIER_TYPE_NON_SALTED,
            1,
        );
    }

    #[test]
    fn non_salted_mock_counts_as_non_salted() {
        assert_service_policy(
            service_config(scope_hash("example.com"), NULLIFIER_TYPE_NON_SALTED),
            NULLIFIER_TYPE_NON_SALTED_MOCK,
            1,
        );
    }

    #[test]
    fn salted_mock_counts_as_salted() {
        assert_service_policy(
            service_config(scope_hash("example.com"), NULLIFIER_TYPE_SALTED),
            NULLIFIER_TYPE_SALTED_MOCK,
            1,
        );
    }

    #[test]
    fn non_salted_mock_with_hidden_identifier_counts_as_none() {
        assert_service_policy(
            service_config(scope_hash("example.com"), NULLIFIER_TYPE_NONE),
            NULLIFIER_TYPE_NON_SALTED_MOCK,
            0,
        );
    }

    #[test(should_fail_with = "wrong unique identifier type")]
    fn non_salted_mock_with_hidden_identifier_is_not_non_salted() {
        assert_service_policy(
            service_config(scope_hash("example.com"), NULLIFIER_TYPE_NON_SALTED),
            NULLIFIER_TYPE_NON_SALTED_MOCK,
            0,
        );
    }

    #[test(should_fail_with = "wrong unique identifier type")]
    fn mock_type_in_config_matches_no_proof() {
        assert_service_policy(
            service_config(scope_hash("example.com"), NULLIFIER_TYPE_NON_SALTED_MOCK),
            NULLIFIER_TYPE_NON_SALTED_MOCK,
            1,
        );
    }

    #[test]
    fn the_testnet_uses_the_testnet_registry() {
        assert_eq(default_registry(TESTNET_CHAIN_ID, TESTNET_VERSION), TESTNET_REGISTRY_ADDRESS);
    }

    #[test(should_fail_with = "no default ZKPassport registry on this network")]
    fn another_rollup_on_the_testnets_l1_does_not_get_the_testnet_registry() {
        let _ = default_registry(TESTNET_CHAIN_ID, TESTNET_VERSION + 1);
    }

    #[test]
    fn txe_uses_the_local_network_registry() {
        assert_eq(default_registry(TXE_CHAIN_ID, TXE_VERSION), LOCAL_NETWORK_REGISTRY_ADDRESS);
    }

    #[test(should_fail_with = "no default ZKPassport registry on this network")]
    fn another_rollup_on_chain_1_does_not_get_the_local_network_registry() {
        let _ = default_registry(TXE_CHAIN_ID, TXE_VERSION + 1);
    }

    #[test]
    unconstrained fn verify_finds_the_local_network_registry_in_txe() {
        let mut env = TestEnvironment::new();
        let _ = deploy_local_network_registry(
            &mut env,
            "@zkpassport_registry_contract/ZKPassportRegistry",
        );
        env.private_context(|context| {
            assert_eq(
                default_registry(context.chain_id(), context.version()),
                LOCAL_NETWORK_REGISTRY_ADDRESS,
            );
        });
    }

    #[test]
    fn a_local_network_of_any_version_uses_the_local_network_registry() {
        assert_eq(default_registry(ANVIL_CHAIN_ID, 1), LOCAL_NETWORK_REGISTRY_ADDRESS);
        assert_eq(default_registry(ANVIL_CHAIN_ID, 2), LOCAL_NETWORK_REGISTRY_ADDRESS);
    }

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
