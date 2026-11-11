# ZKPassport Noir workspace

A Noir workspace to streamline ZKPassport verifications from Aztec contracts and Noir projects. Its main components are:

- The `ZKPassportRegistry` Aztec contract, whose canonical instance is the trusted authority for VKs and for the certificate, circuit, and sanctions roots. This is a port of ZKPassport's Ethereum on-chain registry/verification semantics onto Aztec's private/public split, which comes with different constraints and design tradeoffs.
- The `zkpassport` crate, which implements network agnostic verification on Noir.
- The `zkpassport_aztec_verifier` verification library, that lets any Aztec app privately verify a ZKPassport passport proof
and mint a one-proof-per-passport uniqueness nullifier tailored to its needs.

Example Aztec contracts that use them, and an end-to-end test on a local Aztec network, are in
[zkpassport/aztec-examples](https://github.com/zkpassport/aztec-examples).

The verifier accepts outer proofs made with `bb` 6.0.0, the version the Aztec 6.0.0 protocol runs. The current
ZKPassport app proves with `bb` 5.0.0, and those proofs do not verify on Aztec 6.

## Workspace Layout

Directories drop the `zkpassport_` prefix their packages carry, since the enclosing path
already supplies it: `registry_contract/`, `verifier/`, and `core/` for the `zkpassport` package.

| Package | Type | Purpose | Key dependencies |
|---|---|---|---|
| `zkpassport_registry_contract` | `contract` | The registry. Roles (`admin`/`operator`) are plain `PublicMutable`, writes take effect instantly. Everything else: `paused`, per-registry root sets (certificate/circuit/sanctions) with validity windows and revocation, version-accepted VK sets, and the OPRF pubkey hash, is `DelayedPublicMutable` (24h delay). Exposes `update_root` (operator), policy setters (admin or operator), and private view functions (`assert_proof_valid`, `assert_sanctions_root_valid`, `assert_root_valid_at_timestamp`) that verifiers can bind to. | `aztec` (git, tag `v6.0.0`) |
| `zkpassport` | `lib` | Pure, no-`aztec`-dependency core: outer-proof recursion (`verify_outer_proof_core`), public-input parsing, and commitment wrappers (`age_commitment`, `disclose_commitment`, `sanctions_commitment`, `bind_user_address_commitment`, `birthdate_commitment`, `expiry_date_commitment`, `nationality_inclusion_commitment`, `nationality_exclusion_commitment`, `issuing_country_inclusion_commitment`, `issuing_country_exclusion_commitment`) over the ZKPassport circuits' own Noir libs. | `bb_proof_verification` (git, tag `v6.0.0`), `poseidon` (git, tag `v0.3.0`), plus the ZKPassport `circuits` commitment libs (git, tag `noir-v1.0.0`) — see Pins below |
| `zkpassport_aztec_verifier` | `lib` | The glue Aztec apps actually depend on: re-exports `zkpassport`'s `commitments`, `constants` and `disclosed_data`, and adds `verify.nr` — `ServiceConfig`, `scope_hash`, `verify_zkpassport_proof::<K>` (which also loads and checks a disclose payload) and `check_sanctions`, each with a `_with_registry` variant, and `emit_uniqueness_nullifier`. This is the only crate consumer contracts should import. | `aztec`, `poseidon`, `zkpassport` (path), `zkpassport_registry_contract` (path) |

TXE integration tests are colocated in the contract crate (upstream noir-contracts style):
`registry_contract/src/test.nr` covers admin/roles/pause, root updates/revoke/mode +
delayed visibility, and the private views. They compile/run only under `aztec test` (not
bare `aztec-nargo test`).

## Consumer quick-start

The app-side (TS) half lives in the [`../ts`](../ts) companion package
(`@zkpassport/aztec`). Use it to register the registry artifact with the PXE, assemble
proof capsules, parsing disclosed data, etc. Pair it with the contract-side integration below.

A consumer contract verifies a proof and mints its uniqueness nullifier in one call. Adapted from
the `AgeGate` example in [zkpassport/aztec-examples](https://github.com/zkpassport/aztec-examples),
which passes its own registry so its tests can deploy one:

```noir
use zkpassport_aztec_verifier::verify::{
    emit_uniqueness_nullifier, scope_hash, ServiceConfig, verify_zkpassport_proof,
};
use zkpassport_aztec_verifier::commitments::{age_commitment, bind_user_address_commitment};
use zkpassport_aztec_verifier::constants::NULLIFIER_TYPE_NON_SALTED;

global MIN_AGE: u8 = 18;

// The domain this app's ZKPassport requests come from.
global DOMAIN: Field = scope_hash("example.com");

// The CircuitManifest semver packed as 2-byte BE major/minor/patch, left-aligned bytes32.
// This is packed("0.0.1") — the local/dev release the fixtures are built from.
global CIRCUIT_MANIFEST_VERSION: Field =
    0x0000000000010000000000000000000000000000000000000000000000000000;

/// Claim the 18+ badge for `user`: verifies a ZKPassport proof (outer_count_5, param
/// commitments = {age(18, 0), bind(user)}), burns the unique identifier — one claim per
/// passport — and grants `user` a public soulbound badge. The bind commitment ties the
/// proof itself to `user`, so anyone — a relayer included — may submit the transaction.
#[external("private")]
fn claim(user: AztecAddress) {
    let config = ServiceConfig {
        version: CIRCUIT_MANIFEST_VERSION,
        domain: DOMAIN,
        scope: 0,
        unique_identifier_type: NULLIFIER_TYPE_NON_SALTED,
        validity_period: 7 * 86400,
        dev_mode: false,
        disclose: false,
    };
    let expected = BoundedVec::from_array([
        age_commitment(MIN_AGE, 0),
        bind_user_address_commitment(user.to_field()),
    ]);
    // The capsule rides in the sender's PXE, so it is scoped to the sender.
    let verified = verify_zkpassport_proof::<5>(self.context, self.msg_sender(), config, expected);
    emit_uniqueness_nullifier(self.context, verified.unique_identifier);
    // Deliberately public: the badge is readable by anyone (has_badge(user)); only the
    // passport proof behind it is private.
    self.enqueue_self._grant_badge(user);
}
```

`ServiceConfig.domain` is required: the library rejects a config whose domain is 0.
`ServiceConfig.scope` is optional, 0 for the whole domain. `verify_zkpassport_proof` and
`check_sanctions` use ZKPassport's registry on the network, found by its L1 chain id and rollup
version. In TXE and on a local network that is the local network registry, below. On a network
without one, use `verify_zkpassport_proof_with_registry` and `check_sanctions_with_registry`.

### Testing against the local network registry

The local network registry is a `ZKPassportRegistry` at `LOCAL_NETWORK_REGISTRY_ADDRESS` in both
TXE and a local network. Its admin and operator are the local network's test accounts 0 and 1.

- TXE: `deploy_local_network_registry(&mut env, artifact_path)` from
  `zkpassport_registry_contract::local_network_registry`, with the path `TestEnvironment::deploy`
  takes to the compiled registry, then `seed_local_network_registry` with the roots and vk hash of
  the test's proof. Advance time past the registry's delay before verifying.
- Local network: deploy `ZKPassportRegistry` universally (deployer zero) with default public keys,
  salt `LOCAL_NETWORK_REGISTRY_SALT` and constructor arguments `LOCAL_NETWORK_REGISTRY_ADMIN`,
  `LOCAL_NETWORK_REGISTRY_OPERATOR`, `MODE_VALID_WITHIN_WINDOW` and
  `LOCAL_NETWORK_REGISTRY_VALIDITY_WINDOW`, from test account 0, then seed it with the operator
  (roots) and the admin (vk and version).

Any change to the registry's bytecode or the Aztec toolchain moves the address.
`ts/test/local-network-registry.test.ts` then fails with the new values for
`registry_contract/src/local_network_registry.nr`.

`verify_zkpassport_proof` reads its proof material from a private oracle **capsule**, not from
a function argument.

The client is responsible for stashing `vk ‖ proof ‖ public_inputs` into
the app's capsule slot (`zkpassport::constants::PROOF_CAPSULE_SLOT`, `= 1`) before sending
the transaction.

From `scripts/e2e/run-e2e.ts` in [zkpassport/aztec-examples](https://github.com/zkpassport/aztec-examples):

```typescript
// Must match zkpassport::constants::PROOF_CAPSULE_SLOT.
const PROOF_CAPSULE_SLOT = new Fr(1n)
const VK_FIELDS = 115
const PROOF_FIELDS = 458

// ...

const blob = [...FIXTURE.vkeyFields, ...FIXTURE.proof, ...FIXTURE.publicInputs].map((h) =>
  Fr.fromHexString(h),
)

// The capsule is scoped to `user` — the sandbox account sending the transaction. The claim
// itself goes to the fixture's bound address: the proof carries a bind commitment over it,
// so the sender is effectively a relayer and the badge recipient needs no account here.
const boundUser = AztecAddress.fromFieldUnsafe(Fr.fromHexString(FIXTURE.bindAddress))
const capsule = (fields: Fr[]) =>
  new Capsule(ageGate.address, PROOF_CAPSULE_SLOT, fields, user as AztecAddress)

// ...

const [{ receipt }, claimSecs] = await timed("claim (private tx, client-IVC proving)", () =>
  ageGate.methods.claim(boundUser).send({ from: user, capsules: [capsule(blob)], wait: WAIT }),
)
```

The capsule is consumed by `verify_zkpassport_proof`, which constrains every field (recursive verification, scope/nullifier
checks, registry validity) derived from it, so a malformed or malicious capsule fails the proof rather than being trusted.

An app that reads disclosed MRZ data sets `ServiceConfig.disclose` and passes one fewer expected
commitment. The client then also stashes the disclose payload (`mask ‖ bytes`, one value per
field) into the app's capsule slot `zkpassport::constants::DISCLOSE_CAPSULE_SLOT` (`= 2`).
`verify_zkpassport_proof` loads it once, adds its commitment to the expected ones, and returns
it in `VerifiedProof.disclosure`, the only copy the proof covers. `disclosed_data::disclosed_nationality`
reads the nationality out of it.

## Trust considerations

1. **ZKPassportRegistry is the source of truth.** Certificate, circuit, and sanctions root sets are
   maintained by the registry's operator account, and it trails the Ethereum version of the registry.
2. **All policy changes go through `DelayedPublicMutable` with a 24h delay, including
   revocation.** `set_revocation_status`, `set_root_validation_mode`, `set_validity_window`,
   `pause`/`unpause`, and the accepted-VK/version-status/OPRF-pubkey setters all call
   `schedule_value_change(..)`. A revoked or newly-invalid root therefore stays usable by
   private verifiers for up to 24h after the change lands. This is the same latency Aztec's
   `DelayedPublicMutable` privacy-optimal delay already implies, and it matches the 24h window
   the L1 registries run today.
3. **TXE/`aztec-nargo test` no-op real recursion.** The `verify_proof_with_type`/
   `verify_honk_proof` opcode is not enforced under TXE simulation, so `aztec test` proves
   control flow and storage semantics only. **`bb verify` (from the `test-harness/`) and the local
   network based e2e in [zkpassport/aztec-examples](https://github.com/zkpassport/aztec-examples)
   are the only checks that exercise real proof verification**: the
   harness via native `bb prove`/`bb verify` on the wrapped core library, the e2e via a real
   client-IVC proof produced by the local PXE.
4. **Sanctions checking is opt-in, per service.** The registry's mandatory verify path
   (`assert_proof_valid`, called from `verify_zkpassport_proof`) only checks the certificate and
   circuit registries. A service that wants sanctions screening calls `check_sanctions`
   separately (which calls the registry's `assert_sanctions_root_valid` view) and folds
   `sanctions_commitment(root, is_strict)` into its own `expected_commitments`, mirroring L1's
   `VerifierHelper` split between the mandatory `SubVerifier` checks and app-side sanctions
   verification.
5. **The library verifies the *proof*, binding it to a claimant is the app's job.**
   `verify_zkpassport_proof` takes `capsule_scope: AztecAddress` purely as the PXE capsule
   scope (the sender's account). No constraint ties the verified proof to that scope, to
   `msg_sender`, or to anything caller-specific. A ZKPassport proof capsule
   (`vk ‖ proof ‖ public_inputs`) is otherwise **bearer authorization**: whoever holds the blob
   (leaked for support, restored from a backup, handed to a third-party service) can load it
   into their own PXE under their own account and successfully verify it. Alternatively, apps can
   fold `bind_user_address_commitment(user.to_field())` into `expected_commitments` and have the
   ZKPassport request that produced the proof bind that same address. Then a leaked capsule
   authorizes nothing for anyone else, and any relayer may submit the transaction on the bound
   user's behalf. The `claim` function of the `AgeGate` example in
   [zkpassport/aztec-examples](https://github.com/zkpassport/aztec-examples) is the pattern to copy.
6. **A bind ties a proof to an address, not to a network.** `bind_user_address_commitment` covers
   only the user-address entry of ZKPassport's bound data, with no chain id. A proof bound to an
   address therefore verifies against any deployment of an app, on any Aztec network, whose
   registry accepts its roots and VK, while the proof is within its validity period. Nullifiers
   are siloed per contract, so the same passport can claim once per deployment. A proof whose bound
   data also carries a chain id does not verify, because the bind commitment covers every entry.
7. **The admin can update the registry's code in place.** `update_to(new_class_id)` switches the
   registry to another published contract class at the same address, keeping its storage and roles,
   once the contract instance registry's update delay has passed (`set_update_delay`; one day by
   default). Apps keep the registry address across updates; their PXEs need the new artifact.

## Running the tests

All tests use the Aztec toolchain version in `packages/aztec/.aztecrc`, installed the same way CI
does (check out `.github/workflows/aztec.yml` for more details). From `packages/aztec/`:

```bash
aztec-up install "$(cat .aztecrc)"
# or, without an existing aztec-up:
curl -fsSL "https://install.aztec-labs.com/$(cat .aztecrc)/install" | bash

# In a new shell, put that version on PATH. (`aztec-up use` also works, but switches the
# default version for every other project too.)
eval "$(aztec-up env)"
```

First, the `noir/` tests:

```bash
# 1. Registry contract unit tests (pure logic: root_validation, guards) — no TXE needed
aztec-nargo test --package zkpassport_registry_contract

# 2. Core library unit tests (parse, commitment fixtures) — no TXE needed
aztec-nargo test --package zkpassport

# 3. TXE integration tests (colocated in the contract crates) — REQUIRES `aztec test`, not
#    bare `aztec-nargo test`; these tests need the TXE server that `aztec test` starts (oracle
#    capsules, contract deployment, the embedded fixture, warp cheatcodes).
aztec test
```

Then, the native `bb prove`/`bb verify` harness, which enforces real recursive verification. It
runs from `test-harness/` (a sibling of `noir/` under `packages/aztec/`):

```bash
./test-recursive-verification.sh fixtures/outer_count_4_disclose.json
```

The script resolves the toolchain at `$AZTEC_HOME/versions/<version in .aztecrc>`, where
`AZTEC_HOME` is the Aztec root as `aztec-up` uses it (default `~/.aztec`); set `AZTEC` to a version
directory to use another one.

The end-to-end test, a full deploy and a real client-IVC `claim()` on a local Aztec network, is in
[zkpassport/aztec-examples](https://github.com/zkpassport/aztec-examples).

**The workspace must be compiled before anything in `scripts/` runs.**
`scripts/artifacts/ZKPassportRegistry.ts` is a tracked file that `import`s
`noir/target/<contract>.json`, and `noir/target/` is gitignored. From a fresh clone it fails at
module resolution unless you compile first (and re-run `aztec codegen` if the ABI changed, so the
tracked `.ts` file matches the freshly compiled JSON):

```bash
# From noir/:
aztec compile
# Only if the contract ABI changed since the tracked scripts/artifacts/*.ts were generated:
aztec codegen target -o ../scripts/artifacts
```

## Fixtures

`test-harness/fixtures/*.json` and `core/src/fixtures/proof.nr` embed real
ZKPassport outer proofs whose `current_date` public input is checked against the
Aztec anchor-block timestamp with a 7-day `validity_period` (`ServiceConfig.validity_period`,
see the consumer quick-start above).

The fixtures are deliberately **future-dated to 2050-01-01**
(`FIXTURE_NOW` in `test-harness/generate-proof-fixtures.ts`). This is a workaround because the TXE
and sandbox clocks can only move forward. A wall-clock-dated fixture would expire ~6 days after
generation, while the future-dated one stays verifiable until 2050, the TXE tests and the e2e in
[zkpassport/aztec-examples](https://github.com/zkpassport/aztec-examples) warp their clocks forward
into its freshness window.

A pair of assertions (`proof dated in the future` / `proof too old`) are enforced by
`zkpassport_aztec_verifier::verify::verify_zkpassport_proof`, checked against the private-context anchor
block timestamp. Note `zkpassport::verify::verify_outer_proof_core` does **not** check
freshness itself, that requires an Aztec `PrivateContext` to provide a notion of `now`.

Regenerate via `test-harness/generate-proof-fixtures.sh [disclose|age]`. The `age` run also rewrites the
embedded TXE fixture, `core/src/fixtures/proof.nr` (run `aztec-nargo fmt` over `noir/` afterwards), and a
new disclose fixture needs its public inputs copied into `FIXTURE_PUBLIC_INPUTS` in `core/src/fixtures.nr`,
which the conformance test checks. Fixture generation proves the released circuits of the
`test-harness/circuits` submodule's version (its `package.json`), downloaded from the circuits CDN,
so each fixture's circuit registry root is that release's root and its outer vk hash is the one the
release publishes; the passport and its certificates are synthetic. It proves them with `bb` 6.0.0
from the 6.0.0 toolchain, because the Aztec protocol only accepts proofs made with that `bb`'s Honk
transcript. Everywhere else in this workspace the 6.0.0 toolchain is used.

## Toolchain & dependency pins

| Component | Pin | Notes |
|---|---|---|
| Aztec toolchain | `v6.0.0` (`aztec-nargo` 1.0.0-rc.3, `aztec test`, `bb` 6.0.0) | Everything under `noir/` and `scripts/` compiles/tests/runs against this. Pinned in `packages/aztec/.aztecrc`, which CI reads, failing if an `aztec-nr` or `bb_proof_verification` tag below names another release. Installed via `aztec-up install "$(cat .aztecrc)"` (lands in `~/.aztec/versions/<version>`). |
| `aztec-nr` (the `aztec` crate) | git `https://github.com/aztec-labs-eng/aztec-nr`, tag `v6.0.0`, dir `aztec` | Depended on by `zkpassport_registry_contract` and `zkpassport_aztec_verifier`, which share one `aztec` source. |
| `bb_proof_verification` | git `https://github.com/AztecProtocol/aztec-packages/`, tag `v6.0.0`, dir `barretenberg/noir/bb_proof_verification` | `zkpassport`'s recursive-verification dependency, at the barretenberg release the 6.0.0 toolchain ships. |
| `poseidon` | git `https://github.com/noir-lang/poseidon`, tag `v0.3.0` | Pinned for commitment parity with ZKPassport's own circuits; used by `zkpassport` and `zkpassport_aztec_verifier`. |
| ZKPassport `circuits` repo | git `https://github.com/zkpassport/circuits`, tag `noir-v1.0.0` (= `327d19eb`) | `zkpassport`'s commitment libs: `utils`, `disclose_lib`, `bind_lib`, `compare_age_lib`, `compare_date_lib`, `inclusion_check_country_lib`, `exclusion_check_country_lib`, `exclusion_check_sanctions_lib`. The proof fixtures are generated from the `test-harness/circuits` **submodule**, pinned at the same commit, and prove the circuits released at that commit's version. Only fixture regeneration (`test-harness/generate-proof-fixtures.sh`) needs the submodule initialized — building/testing the workspace does not. |
| `@zkpassport/utils` (TS) | `0.40.0-beta.3` (the `circuits` submodule's pin) | `test-harness/generate-proof-fixtures.ts` imports it from the `circuits` submodule's own node_modules. `test-harness/fixture-conformance.test.ts` reads the conformance vectors from this repo's `packages/zkpassport-utils/conformance/vectors.json`. Not a dependency of `scripts/` or any Noir package. |
