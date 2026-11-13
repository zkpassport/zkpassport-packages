use crate::query::Query;
use aztec::{
    context::PrivateContext,
    oracle::capsules,
    protocol::{address::AztecAddress, hash::sha256_to_field, traits::FromField},
};
use poseidon::poseidon2::Poseidon2;
use zkpassport::constants::{
    CURRENT_DATE_MAX_SKEW, DISCLOSE_CAPSULE_SLOT, NULLIFIER_TYPE_NON_SALTED,
    NULLIFIER_TYPE_NON_SALTED_MOCK, NULLIFIER_TYPE_NONE, NULLIFIER_TYPE_SALTED,
    NULLIFIER_TYPE_SALTED_MOCK, PROOF_CAPSULE_SLOT, PROOF_FIELDS, SANCTIONS_CAPSULE_SLOT, VK_FIELDS,
};
use zkpassport::disclosed_data::{
    disclosed_birthdate, disclosed_document_number, disclosed_document_type, disclosed_expiry_date,
    disclosed_gender, disclosed_issuing_country, disclosed_name, disclosed_nationality,
};
use zkpassport::verify::verify_outer_proof_core;
use zkpassport_registry_contract::{
    local_network_registry::LOCAL_NETWORK_REGISTRY_ADDRESS, ZKPassportRegistry,
};

pub struct ServiceConfig {
    // Circuit-manifest version this app accepts (the registry keys vks by it), as
    // `circuit_version` packs it
    pub version: Field,
    pub domain: Field, // scope_hash of the domain the app's requests come from, never 0
    pub scope: Field, // scope_hash of a scope within the domain, 0 for the whole domain
    pub unique_identifier_type: u8, // the real NULLIFIER_TYPE_* the proof must carry
    pub validity_period: u64, // max proof age in seconds
    pub dev_mode: bool,
}

impl ServiceConfig {
    /// A config for proofs requested from `domain` and made with the circuits release `version`,
    /// packed with `circuit_version`. It covers the whole domain, requires a non-salted unique
    /// identifier, accepts proofs up to 7 days old, as the ZKPassport SDK does by default, and
    /// rejects mock documents. The methods below change each of these.
    ///
    /// Build it in a global, so the domain is hashed at compile time and a mistake such as an
    /// empty domain fails to compile:
    /// `global SERVICE: ServiceConfig = ServiceConfig::new("example.com", circuit_version(0, 22, 0));`
    pub fn new<let N: u32>(domain: str<N>, version: Field) -> Self {
        assert(N != 0, "service domain required");

        ServiceConfig {
            version,
            domain: scope_hash(domain),
            scope: 0,
            unique_identifier_type: NULLIFIER_TYPE_NON_SALTED,
            validity_period: DEFAULT_VALIDITY_PERIOD,
            dev_mode: false,
        }
    }

    /// Accept only proofs for `scope`, a scope within the domain.
    pub fn scope<let N: u32>(mut self, scope: str<N>) -> Self {
        self.scope = scope_hash(scope);
        self
    }

    /// Require a unique identifier of this type, one of the `NULLIFIER_TYPE_*` constants.
    pub fn unique_identifier_type(mut self, unique_identifier_type: u8) -> Self {
        self.unique_identifier_type = unique_identifier_type;
        self
    }

    /// Accept proofs up to `seconds` old.
    pub fn validity_period(mut self, seconds: u64) -> Self {
        self.validity_period = seconds;
        self
    }

    /// Accept proofs of mock documents too, such as the ones ZKPassport's apps make in dev mode.
    pub fn dev_mode(mut self) -> Self {
        self.dev_mode = true;
        self
    }
}

/// The payload of a disclose subproof: which of the 90 MRZ bytes are disclosed, and the bytes.
pub struct Disclosure {
    pub mask: [bool; 90],
    pub bytes: [u8; 90],
}

pub struct VerifiedProof {
    pub unique_identifier: Field,
    pub current_date: u64,
    pub disclosure: Option<Disclosure>, // some exactly when the query discloses a field
    pub sanctions_root: Option<Field>, // some exactly when the query asks for sanctions
}

impl VerifiedProof {
    /// Read the document code, such as "P<" for a passport or "I<" for an ID card.
    pub fn document_type(self) -> [u8; 2] {
        let disclosure = self.disclosed();
        disclosed_document_type(disclosure.mask, disclosure.bytes)
    }

    /// Read the issuing country's three-letter code as the MRZ carries it ("D<<" for Germany).
    pub fn issuing_country(self) -> [u8; 3] {
        let disclosure = self.disclosed();
        disclosed_issuing_country(disclosure.mask, disclosure.bytes)
    }

    /// Read the document number's nine MRZ characters, padded with '<'.
    pub fn document_number(self) -> [u8; 9] {
        let disclosure = self.disclosed();
        disclosed_document_number(disclosure.mask, disclosure.bytes)
    }

    /// Read the nationality's three-letter code as the MRZ carries it ("D<<" for Germany).
    pub fn nationality(self) -> [u8; 3] {
        let disclosure = self.disclosed();
        disclosed_nationality(disclosure.mask, disclosure.bytes).nationality
    }

    /// Read the date of birth as YYMMDD ASCII digits.
    pub fn birthdate(self) -> [u8; 6] {
        let disclosure = self.disclosed();
        disclosed_birthdate(disclosure.mask, disclosure.bytes)
    }

    /// Read the expiry date as YYMMDD ASCII digits.
    pub fn expiry_date(self) -> [u8; 6] {
        let disclosure = self.disclosed();
        disclosed_expiry_date(disclosure.mask, disclosure.bytes)
    }

    /// Read the gender: 'M', 'F' or '<'.
    pub fn gender(self) -> u8 {
        let disclosure = self.disclosed();
        disclosed_gender(disclosure.mask, disclosure.bytes)
    }

    /// Read the MRZ name field, such as "ERIKSSON<<ANNA<MARIA<<<", with 0 for each byte the proof
    /// does not disclose. A proof that discloses none of the name fails.
    pub fn name(self) -> BoundedVec<u8, 39> {
        let disclosure = self.disclosed();
        disclosed_name(disclosure.mask, disclosure.bytes)
    }

    fn disclosed(self) -> Disclosure {
        assert(self.disclosure.is_some(), "the proof discloses nothing");
        self.disclosure.unwrap()
    }
}

// The ZKPassport SDK's default for how old a proof may be: 7 days, in seconds.
global DEFAULT_VALIDITY_PERIOD: u64 = 7 * 86400;

// The weights of a circuit version's major, minor and patch, two bytes apart from the top byte.
global TWO_POW_240: Field = 0x1000000000000000000000000000000000000000000000000000000000000;
global TWO_POW_224: Field = 0x100000000000000000000000000000000000000000000000000000000;
global TWO_POW_208: Field = 0x10000000000000000000000000000000000000000000000000000;

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

// The L1 chain id and the rollup version of Aztec mainnet, and ZKPassport's registry on it.
global MAINNET_CHAIN_ID: Field = 1;
global MAINNET_VERSION: Field = 2070860440;
global MAINNET_REGISTRY_ADDRESS: AztecAddress = AztecAddress::from_field(
    0x1478d06759c62f151751aa08e2ce8950dd49e9891c40b9a93774a4686000e8fc,
);

// ZKPassport's registry deployments, as (chain id, version, registry address) tuples.
// Chain id refers to the L1 the network settles on and version to the network's rollup.
// A version of none matches every version on that chain.
global REGISTRY_DEPLOYMENTS: [(Field, Option<Field>, AztecAddress); 4] = [
    (TXE_CHAIN_ID, Option::some(TXE_VERSION), LOCAL_NETWORK_REGISTRY_ADDRESS),
    // A local network, at any rollup version: Anvil's chain id is never a live network's
    (ANVIL_CHAIN_ID, Option::none(), LOCAL_NETWORK_REGISTRY_ADDRESS),
    (TESTNET_CHAIN_ID, Option::some(TESTNET_VERSION), TESTNET_REGISTRY_ADDRESS),
    (MAINNET_CHAIN_ID, Option::some(MAINNET_VERSION), MAINNET_REGISTRY_ADDRESS),
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

/// Packs a circuits release version for `ServiceConfig`: major, minor and patch as 2-byte
/// big-endian numbers at the start of 32 bytes, as `circuitVersionToBytes32` in @zkpassport/utils.
///
/// Call it in a global so it is computed at compile time:
/// `global VERSION: Field = circuit_version(0, 22, 0);`
pub fn circuit_version(major: u16, minor: u16, patch: u16) -> Field {
    assert((major != 0) | (minor != 0) | (patch != 0), "circuit version 0.0.0 encodes to 0");
    // A Field is below the BN254 scalar field modulus, 0x30644e72e131a029…, so a version from
    // major 0x3064 up can wrap around
    assert(major < 0x3064, "circuit version major must be below 12388");

    (major as Field) * TWO_POW_240 + (minor as Field) * TWO_POW_224 + (patch as Field) * TWO_POW_208
}

/// Verify a zkPassport outer proof end-to-end, against ZKPassport's registry on this network.
///
/// `capsule_scope` is the PXE account scope the proof capsule was delivered under. Consider the
/// transaction sender (`msg_sender`) is not necessarily the subject of the proof. It only
/// selects where the capsule is read from, nothing about the proof's validity depends on it.
///
/// `query` says what the proof must show. A query that discloses a field also reads the disclose
/// capsule, and one that asks for sanctions reads the sanctions capsule.
///
/// In TXE and on a local network this is the local network registry, see
/// `zkpassport_registry_contract::local_network_registry`. Use
/// `verify_zkpassport_proof_with_registry` on a network without a ZKPassport registry.
pub fn verify_zkpassport_proof<let K: u32, let D: u32>(
    context: &mut PrivateContext,
    capsule_scope: AztecAddress,
    config: ServiceConfig,
    query: Query<K, D>,
) -> VerifiedProof {
    let registry = default_registry(context.chain_id(), context.version());
    verify_zkpassport_proof_with_registry(context, registry, capsule_scope, config, query)
}

/// `verify_zkpassport_proof` against the registry at `registry`.
///
/// For a network without a ZKPassport registry, such as a local network or TXE tests, or an app
/// that trusts a registry of its own.
pub fn verify_zkpassport_proof_with_registry<let K: u32, let D: u32>(
    context: &mut PrivateContext,
    registry: AztecAddress,
    capsule_scope: AztecAddress,
    config: ServiceConfig,
    query: Query<K, D>,
) -> VerifiedProof {
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

    // The disclose payload and the sanctions root are loaded once, here: a second load is a
    // separate oracle call the sender's PXE can answer differently, so only these copies are
    // bound to the proof.
    let disclosure = if D == 1 {
        // Safety: the loaded payload is untrusted input; parse_disclose_payload range-constrains
        // every element, and the query's disclose commitment binds the result to the proof.
        let payload: Option<[Field; 180]> =
            unsafe { capsules::load(context.this_address(), DISCLOSE_CAPSULE_SLOT, capsule_scope) };

        assert(payload.is_some(), "missing disclose capsule");
        let disclosure = parse_disclose_payload(payload.unwrap());
        query.assert_disclosed(disclosure);
        Option::some(disclosure)
    } else {
        Option::none()
    };

    let sanctions_root = if query.sanctions_requested() {
        // Safety: the loaded root is untrusted input; the query's sanctions commitment binds it
        // to the proof, and the registry checks it below.
        let root: Option<Field> = unsafe {
            capsules::load(
                context.this_address(),
                SANCTIONS_CAPSULE_SLOT,
                capsule_scope,
            )
        };

        assert(root.is_some(), "missing sanctions capsule");
        root
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
        query.expected_commitments(disclosure, sanctions_root),
    );
    let parsed = out.parsed;

    assert_service_policy(config, parsed.nullifier_type, parsed.scoped_nullifier);

    // Freshness vs the anchor-block timestamp
    let anchor_ts = context.get_anchor_block_header().timestamp();
    assert(parsed.current_date <= anchor_ts + CURRENT_DATE_MAX_SKEW, "proof dated in the future");
    assert(parsed.current_date + config.validity_period > anchor_ts, "proof too old");

    // Registry view calls to verify roots + vk acceptance + OPRF, at the proof's date
    let registry = ZKPassportRegistry::at(registry);
    registry
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
    if sanctions_root.is_some() {
        registry.assert_sanctions_root_valid(sanctions_root.unwrap(), parsed.current_date).view(
            context,
        );
    }

    VerifiedProof {
        unique_identifier: parsed.scoped_nullifier,
        current_date: parsed.current_date,
        disclosure,
        sanctions_root,
    }
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

mod test {
    use crate::verify::{
        ANVIL_CHAIN_ID, assert_service_policy, circuit_version, default_registry, Disclosure,
        MAINNET_CHAIN_ID, MAINNET_REGISTRY_ADDRESS, MAINNET_VERSION, parse_disclose_payload,
        scope_hash, ServiceConfig, TESTNET_CHAIN_ID, TESTNET_REGISTRY_ADDRESS, TESTNET_VERSION,
        TXE_CHAIN_ID, TXE_VERSION, VerifiedProof,
    };
    use aztec::test::helpers::test_environment::TestEnvironment;
    use zkpassport::constants::{
        NULLIFIER_TYPE_NON_SALTED, NULLIFIER_TYPE_NON_SALTED_MOCK, NULLIFIER_TYPE_NONE,
        NULLIFIER_TYPE_SALTED, NULLIFIER_TYPE_SALTED_MOCK,
    };
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
        }
    }

    fn verified_proof(disclosure: Option<Disclosure>) -> VerifiedProof {
        VerifiedProof {
            unique_identifier: 1,
            current_date: 0,
            disclosure,
            sanctions_root: Option::none(),
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
    fn circuit_version_packs_like_utils() {
        // circuitVersionToBytes32 in @zkpassport/utils
        assert(
            circuit_version(0, 22, 0)
                == 0x0000001600000000000000000000000000000000000000000000000000000000,
        );
        assert(
            circuit_version(1, 2, 3)
                == 0x0001000200030000000000000000000000000000000000000000000000000000,
        );
        assert(
            circuit_version(12387, 65535, 65535)
                == 0x3063ffffffff0000000000000000000000000000000000000000000000000000,
        );
    }

    #[test(should_fail_with = "circuit version 0.0.0 encodes to 0")]
    fn circuit_version_rejects_0_0_0() {
        let _ = circuit_version(0, 0, 0);
    }

    #[test(should_fail_with = "circuit version major must be below 12388")]
    fn circuit_version_rejects_a_major_from_12388() {
        let _ = circuit_version(12388, 0, 0);
    }

    #[test]
    fn new_service_config_has_the_sdk_defaults() {
        let config = ServiceConfig::new("example.com", circuit_version(0, 22, 0));

        assert(config.version == circuit_version(0, 22, 0));
        assert(config.domain == scope_hash("example.com"));
        assert(config.scope == 0);
        assert(config.unique_identifier_type == NULLIFIER_TYPE_NON_SALTED);
        assert(config.validity_period == 7 * 86400);
        assert(!config.dev_mode);
    }

    #[test(should_fail_with = "service domain required")]
    fn new_service_config_rejects_an_empty_domain() {
        let _ = ServiceConfig::new("", circuit_version(0, 22, 0));
    }

    #[test]
    fn service_config_methods_set_their_own_fields() {
        let config = ServiceConfig::new("example.com", circuit_version(0, 22, 0))
            .scope("age-check")
            .unique_identifier_type(NULLIFIER_TYPE_SALTED)
            .validity_period(86400)
            .dev_mode();

        assert(config.version == circuit_version(0, 22, 0));
        assert(config.domain == scope_hash("example.com"));
        assert(config.scope == scope_hash("age-check"));
        assert(config.unique_identifier_type == NULLIFIER_TYPE_SALTED);
        assert(config.validity_period == 86400);
        assert(config.dev_mode);
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
    fn the_mainnet_uses_the_mainnet_registry() {
        assert_eq(default_registry(MAINNET_CHAIN_ID, MAINNET_VERSION), MAINNET_REGISTRY_ADDRESS);
    }

    #[test(should_fail_with = "no default ZKPassport registry on this network")]
    fn another_rollup_on_the_mainnets_l1_does_not_get_the_mainnet_registry() {
        let _ = default_registry(MAINNET_CHAIN_ID, MAINNET_VERSION + 1);
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

    // A passport's whole MRZ, disclosed
    fn passport_disclosure() -> Disclosure {
        let mrz = "P<SWEERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<L898902C36NOR7408122F3204159ZE184226B<<<<<10"
            .as_bytes();
        let mut mask = [false; 90];
        let mut bytes = [0 as u8; 90];
        for i in 0..88 {
            mask[i] = true;
            bytes[i] = mrz[i];
        }
        Disclosure { mask, bytes }
    }

    #[test]
    fn reads_every_disclosed_field_of_a_verified_proof() {
        let verified = verified_proof(Option::some(passport_disclosure()));

        assert_eq(verified.document_type(), "P<".as_bytes());
        assert_eq(verified.issuing_country(), "SWE".as_bytes());
        assert_eq(verified.document_number(), "L898902C3".as_bytes());
        assert_eq(verified.nationality(), "NOR".as_bytes());
        assert_eq(verified.birthdate(), "740812".as_bytes());
        assert_eq(verified.expiry_date(), "320415".as_bytes());
        assert_eq(verified.gender(), "F".as_bytes()[0]);
        assert_eq(
            verified.name(),
            BoundedVec::from_array("ERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<".as_bytes()),
        );
    }

    #[test(should_fail_with = "the proof discloses nothing")]
    fn a_proof_without_a_disclosure_has_no_field_to_read() {
        let _ = verified_proof(Option::none()).nationality();
    }

    // A passport's whole MRZ, disclosed except for `length` bytes from `start`
    fn passport_disclosure_hiding(start: u32, length: u32) -> Disclosure {
        let mut disclosure = passport_disclosure();
        for i in 0..length {
            disclosure.mask[start + i] = false;
            disclosure.bytes[start + i] = 0;
        }
        disclosure
    }

    #[test(should_fail_with = "document type not disclosed")]
    fn reading_a_hidden_document_type_fails() {
        let _ = verified_proof(Option::some(passport_disclosure_hiding(0, 2))).document_type();
    }

    #[test(should_fail_with = "issuing country not disclosed")]
    fn reading_a_hidden_issuing_country_fails() {
        let _ = verified_proof(Option::some(passport_disclosure_hiding(2, 3))).issuing_country();
    }

    #[test(should_fail_with = "document number not disclosed")]
    fn reading_a_hidden_document_number_fails() {
        let _ = verified_proof(Option::some(passport_disclosure_hiding(44, 9))).document_number();
    }

    #[test(should_fail_with = "nationality not disclosed")]
    fn reading_a_hidden_nationality_fails() {
        let _ = verified_proof(Option::some(passport_disclosure_hiding(54, 3))).nationality();
    }

    #[test(should_fail_with = "birthdate not disclosed")]
    fn reading_a_hidden_birthdate_fails() {
        let _ = verified_proof(Option::some(passport_disclosure_hiding(57, 6))).birthdate();
    }

    #[test(should_fail_with = "gender not disclosed")]
    fn reading_a_hidden_gender_fails() {
        let _ = verified_proof(Option::some(passport_disclosure_hiding(64, 1))).gender();
    }

    #[test(should_fail_with = "expiry date not disclosed")]
    fn reading_a_hidden_expiry_date_fails() {
        let _ = verified_proof(Option::some(passport_disclosure_hiding(65, 6))).expiry_date();
    }

    #[test(should_fail_with = "name not disclosed")]
    fn reading_a_wholly_hidden_name_fails() {
        let _ = verified_proof(Option::some(passport_disclosure_hiding(5, 39))).name();
    }

    #[test]
    fn reads_a_partly_hidden_name_with_zeros() {
        let last_name = "ERIKSSON<<".as_bytes();
        let verified = verified_proof(Option::some(passport_disclosure_hiding(15, 29)));

        let mut expected_name = [0; 39];
        for i in 0..10 {
            expected_name[i] = last_name[i];
        }
        assert_eq(verified.name(), BoundedVec::from_array(expected_name));
    }
}
