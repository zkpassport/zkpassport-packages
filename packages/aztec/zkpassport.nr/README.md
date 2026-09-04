# zkpassport.nr

A Noir workspace to streamline ZKPassport verifications from Aztec contracts and Noir projects. Its main components are:

- The `ZKPassportRegistry` Aztec contract, whose canonical instance is the trusted authority for VKs and for the certificate, circuit, and sanctions roots. This is a port of ZKPassport's Ethereum on-chain registry/verification semantics onto Aztec's private/public split, which comes with different constraints and design tradeoffs.
- The `zkpassport_core` crate, which implements network agnostic verification on Noir.
- The `zkpassport_aztec` verification library, that lets any Aztec app privately verify a ZKPassport passport proof
and mint a one-proof-per-passport uniqueness nullifier tailored to its needs.
- An example `AgeGate` Aztec contract, that shows how everything fits together e2e.

## Workspace Layout

| Package | Type | Purpose | Key dependencies |
|---|---|---|---|
| `zkpassport_registry_contract` | `contract` | The registry. Roles (`admin`/`oracle`/`guardian`) are plain `PublicMutable`, writes take effect instantly. Everything else: `paused`, per-registry root sets (certificate/circuit/sanctions) with validity windows and revocation, version-accepted VK sets, and the OPRF pubkey hash, is `DelayedPublicMutable` (24h delay). Exposes `update_root` (oracle), admin policy setters, and private view functions (`assert_proof_valid`, `assert_sanctions_root_valid`, `assert_root_valid_at_timestamp`) that verifiers can bind to. | `aztec` (git, tag `v5.2.0`) |
| `zkpassport_core` | `lib` | Pure, no-`aztec`-dependency core: outer-proof recursion (`verify_outer_proof_core`), public-input parsing, and commitment wrappers (`age_commitment`, `disclose_commitment`, `sanctions_commitment`, `bind_user_address_commitment`) over the ZKPassport circuits' own Noir libs. | `bb_proof_verification` (git, tag `v5.2.0`), `poseidon` (git, tag `v0.3.0`), plus the ZKPassport `circuits` commitment libs (git, tag `noir-v1.0.0-beta.22`) — see Pins below |
| `zkpassport_aztec` | `lib` | The glue Aztec apps actually depend on: re-exports `zkpassport_core`, and adds `verify.nr` — `ServiceConfig`, `verify_zkpassport_proof::<K>`, capsule loaders (`load_disclose_payload`), `check_sanctions`, `emit_uniqueness_nullifier`. This is the only crate consumer contracts should import. | `aztec`, `poseidon`, `zkpassport_core` (path), `zkpassport_registry_contract` (path) |
| `examples/age_gate_contract` | `contract` | Minimal consumer example: an 18+ age-gate `claim()` using `verify_zkpassport_proof::<5>` (age + bind commitments) + `emit_uniqueness_nullifier`, granting a public soulbound badge (`has_badge`). | `aztec`, `zkpassport_aztec`, `zkpassport_registry_contract` (path) |

TXE integration tests are colocated in the contract crates (upstream noir-contracts style):
`zkpassport_registry_contract/src/test.nr` covers admin/roles/pause, root updates/revoke/mode +
delayed visibility, and the private views; `examples/age_gate_contract/src/test.nr` runs one full
age-gate flow against an embedded real fixture. They compile/run only under `aztec test` (not
bare `aztec-nargo test`).

## Consumer quick-start

The app-side (TS) half — registering the registry artifact with the PXE, assembling the
proof capsules, parsing disclosed data — lives in the [`../ts`](../ts) companion package
(`@zkpassport/aztec`); pair it with the contract-side integration below.

A consumer contract verifies a proof and mints its uniqueness nullifier in one call. From
`examples/age_gate_contract/src/main.nr`:

```noir
use zkpassport_aztec::verify::{
    emit_uniqueness_nullifier, ServiceConfig, verify_zkpassport_proof,
};
use zkpassport_aztec::commitments::{age_commitment, bind_user_address_commitment};

global MIN_AGE: u8 = 18;

// The CircuitManifest semver packed as 2-byte BE major/minor/patch, left-aligned bytes32.
// This is packed("0.0.1") — the local/dev release the fixtures are built from.
global CIRCUIT_MANIFEST_VERSION: Field =
    0x0000000000010000000000000000000000000000000000000000000000000000;

/// Claim the 18+ badge for `user`: verifies a ZKPassport proof (outer_count_5, param
/// commitments = {age(18, 0), bind(user)}), burns the scoped nullifier — one claim per
/// passport — and grants `user` a public soulbound badge. The bind commitment ties the
/// proof itself to `user`, so anyone — a relayer included — may submit the transaction.
#[external("private")]
fn claim(user: AztecAddress) {
    let registry = self.storage.registry.read();
    let config = ServiceConfig {
        version: CIRCUIT_MANIFEST_VERSION,
        scope: 0, // fixture/demo: no domain binding; a real app pins sha256(domain) >> 8
        subscope: 0,
        validity_period: 7 * 86400,
        dev_mode: false,
    };
    let expected = [age_commitment(MIN_AGE, 0), bind_user_address_commitment(user.to_field())];
    // The capsule rides in the sender's PXE, so it is scoped to the sender.
    let verified = verify_zkpassport_proof::<5>(
        self.context, registry, self.msg_sender(), config, expected,
    );
    emit_uniqueness_nullifier(self.context, verified.scoped_nullifier);
    // Deliberately public: the badge is readable by anyone (has_badge(user)); only the
    // passport proof behind it is private.
    self.enqueue_self._grant_badge(user);
}
```

`verify_zkpassport_proof` reads its proof material from a private oracle **capsule**, not from
a function argument.

The client is responsible for stashing `vk ‖ proof ‖ public_inputs` into
the app's capsule slot (`zkpassport_core::constants::PROOF_CAPSULE_SLOT`, `= 1`) before sending
the transaction.

From `scripts/e2e/run-e2e.ts`:

```typescript
// Must match zkpassport_core::constants::PROOF_CAPSULE_SLOT.
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

## Trust considerations

1. **ZKPassportRegistry is the source of truth.** Certificate, circuit, and sanctions root sets are
   maintained by the registry's oracle account, and it trails the Ethereum version of the registry.
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
   network based e2e (`scripts/`) are the only checks that exercise real proof verification**: the
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
   user's behalf. The example function `claim` in the `AgeGate` contract at
   `examples/age_gate_contract/src/main.nr` is the pattern to copy.

## Running the tests

All tests use the Aztec `v5.2.0` toolchain, installed the same way CI does (check out
`.github/workflows/aztec.yml` for more details):

```bash
aztec-up install 5.2.0
# or, without an existing aztec-up:
curl -fsSL https://install.aztec.network/5.2.0/install | bash
```

First, the `zkpassport.nr/` tests:

```bash
# 1. Registry contract unit tests (pure logic: root_validation, guards) — no TXE needed
aztec-nargo test --package zkpassport_registry_contract

# 2. Core library unit tests (parse, commitment fixtures) — no TXE needed
aztec-nargo test --package zkpassport_core

# 3. TXE integration tests (colocated in the contract crates) — REQUIRES `aztec test`, not
#    bare `aztec-nargo test`; these tests need the TXE server that `aztec test` starts (oracle
#    capsules, contract deployment, the embedded fixture, warp cheatcodes).
aztec test
```

Then, the native `bb prove`/`bb verify` harness, which enforces real recursive verification. It
runs from `test-harness/` (a sibling of `zkpassport.nr/` under `packages/aztec/`):

```bash
./test-recursive-verification.sh fixtures/outer_count_4_disclose.json
./test-recursive-verification.sh fixtures/outer_count_5_age.json
```

The script resolves the toolchain at `~/.aztec/versions/5.2.0`; point `AZTEC_HOME` elsewhere for
a non-default install location.

Finally, the end to end test at `scripts/`. It runs a full deploy + real client-IVC `claim()` against
a local Aztec network (`AztecNode` at `localhost:8080` by default). It needs a running sandbox and
native client-IVC proving.

**The workspace must be compiled first.** `scripts/artifacts/{ZKPassportRegistry,AgeGate}.ts`
are tracked files that `import` from `zkpassport.nr/target/<contract>.json`, and
`zkpassport.nr/target/` is gitignored. From a fresh clone the recipe below fails at module
resolution before a single line runs unless you compile first (and re-run `aztec codegen` if the
ABI changed, so the tracked artifact `.ts` files match the freshly compiled JSON):

```bash
# From zkpassport.nr/:
aztec compile
# Only if the contract ABI changed since the tracked scripts/artifacts/*.ts were generated:
aztec codegen target -o ../scripts/artifacts

cd ../scripts && npm install && npx tsx e2e/run-e2e.ts
```

## Fixtures

`test-harness/fixtures/*.json` and `zkpassport_core/src/fixtures/proof.nr` embed real
ZKPassport outer proofs whose `current_date` public input is checked against the
Aztec anchor-block timestamp with a 7-day `validity_period` (`ServiceConfig.validity_period`,
see the `AgeGate` example above).

The fixtures are deliberately **future-dated to 2050-01-01**
(`FIXTURE_NOW` in `test-harness/generate-proof-fixtures.ts`). This is a workaround because the TXE
and sandbox clocks can only move forward. A wall-clock-dated fixture would expire ~6 days after
generation, while the future-dated one stays verifiable until 2050, the TXE test and the e2e warp
their clocks forward into its freshness window.

A pair of assertions (`proof dated in the future` / `proof too old`) are enforced by
`zkpassport_aztec::verify::verify_zkpassport_proof`, checked against the private-context anchor
block timestamp. Note `zkpassport_core::verify::verify_outer_proof_core` does **not** check
freshness itself, that requires an Aztec `PrivateContext` to provide a notion of `now`.

Regenerate via `test-harness/generate-proof-fixtures.sh [disclose|age]`, then
`test-harness/fixture-to-noir.ts` to refresh the embedded TXE fixture. Fixture generation needs a
**separate 5.0.1 toolchain install** to be faithful to the barretenberg build ZKPassport's production circuits were actually compiled
and proved with (`bb` 5.0.0-nightly). Everywhere else in this workspace the 5.2.0 toolchain is used.

## Toolchain & dependency pins

| Component | Pin | Notes |
|---|---|---|
| Aztec toolchain | `v5.2.0` (`aztec-nargo`, `aztec test`, `bb` 5.2.0-nightly) | Everything under `zkpassport.nr/` and `scripts/` compiles/tests/runs against this. Installed via `aztec-up install 5.2.0` (lands in `~/.aztec/versions/5.2.0`). |
| `aztec-nr` (the `aztec` crate) | git `https://github.com/AztecProtocol/aztec-packages/`, tag `v5.2.0`, dir `noir-projects/aztec-nr/aztec` | Depended on by `zkpassport_registry_contract`, `zkpassport_aztec`, `age_gate_contract`. Sourced from the monorepo (not the `aztec-nr` mirror) so all members share one `aztec` source. |
| `bb_proof_verification` | git `https://github.com/AztecProtocol/aztec-packages/`, tag `v5.2.0`, dir `barretenberg/noir/bb_proof_verification` | `zkpassport_core`'s recursive-verification dependency. |
| `poseidon` | git `https://github.com/noir-lang/poseidon`, tag `v0.3.0` | Pinned for commitment parity with ZKPassport's own circuits; used by `zkpassport_core` and `zkpassport_aztec`. |
| ZKPassport `circuits` repo | git `https://github.com/zkpassport/circuits`, tag `noir-v1.0.0-beta.22` (= `d3a75acb`) | `zkpassport_core`'s commitment libs: `utils`, `disclose_lib`, `bind_lib`, `compare_age_lib`, `exclusion_check_sanctions_lib`. The proof fixtures are generated from the `test-harness/circuits` **submodule**, pinned at `1a1836eb`; the tag's only delta vs that commit is one additive, unused global in `utils` (the commitment-fixture tests confirm identical commitments). Only fixture regeneration (`test-harness/generate-proof-fixtures.sh`) needs the submodule initialized — building/testing the workspace does not. |
| `@zkpassport/utils` (TS) | `0.37.4` (this repo's `packages/zkpassport-utils` workspace package) | `test-harness/generate-commitment-fixtures.ts` imports it from the workspace (`bun i && bun run --cwd packages/zkpassport-utils build` first). `test-harness/generate-proof-fixtures.ts` imports it from the `circuits` submodule's own node_modules, which pins the same version. Not a dependency of `scripts/` or any Noir package. |
| `bb` (fixture generation only) | 5.0.0-nightly, from the separate `5.0.1` Aztec toolchain install | Matches the `bb` build ZKPassport's production circuits were compiled/proved with; required only by `test-harness/generate-proof-fixtures.sh`, never by test/build commands above. |
