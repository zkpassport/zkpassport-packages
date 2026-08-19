# zkpassport.nr

An Aztec v5.2.0 Noir workspace: the `ZKPassportRegistry` contract plus a `zkpassport`
verification library that lets any Aztec app privately verify a ZKPassport passport proof
and mint a one-proof-per-passport-per-app uniqueness nullifier.

This is a port of ZKPassport's Ethereum on-chain registry/verification semantics
(`RegistryInstance` × 3, `RootRegistry`, `SubVerifier`) onto Aztec's private/public split,
using `DelayedPublicMutable` so private functions can read registry state that is written in
public. Full design rationale, the nine locked-in decisions, and the M1/M2 split live in the
design spec: `docs/superpowers/specs/2026-08-17-zkpassport-registry-design.md` in the local
`zkpassport-aztec` planning checkout (not part of this repository).

## Workspace layout

```toml
# zkpassport.nr/Nargo.toml
[workspace]
members = ["zkpassport_registry_contract", "zkpassport_core", "zkpassport", "examples/age_gate_contract"]
```

| Package | Type | Purpose | Key dependencies |
|---|---|---|---|
| `zkpassport_registry_contract` | `contract` | The registry. Roles (`admin`/`oracle`/`guardian`) are plain `PublicMutable` — writes take effect instantly (`main.nr:24-26`). Everything else — `paused`, per-registry root sets (certificate/circuit/sanctions) with validity windows and revocation, the accepted-VK set, and the OPRF pubkey hash — is `DelayedPublicMutable` (24h delay). Exposes `update_root` (oracle), admin policy setters, and private `#[view]` functions (`assert_proof_valid`, `assert_sanctions_root_valid`, `assert_root_valid_at_timestamp`) that verifiers call. | `aztec` (git, tag `v5.2.0`) |
| `zkpassport_core` | `lib` | Pure, no-`aztec`-dependency core: outer-proof recursion (`verify_outer_proof_core`), public-input parsing, and commitment wrappers (`age_commitment`, `disclose_commitment`, `sanctions_commitment`, `bind_user_address_commitment`) over the ZKPassport circuits' own Noir libs. This crate is what the `test-harness/` proves against natively (no TXE needed). | `bb_proof_verification` (git, tag `v5.2.0`), `poseidon` (git, tag `v0.3.0`), plus **path deps** into the sibling `circuits` checkout — see Pins below |
| `zkpassport` | `lib` | The glue apps actually depend on: re-exports `zkpassport_core`, and adds `verify.nr` — `ServiceConfig`, `verify_zkpassport_proof::<K>`, capsule loaders (`load_disclose_payload`), `check_sanctions`, `emit_uniqueness_nullifier`. This is the only crate consumer contracts should import. | `aztec`, `poseidon`, `zkpassport_core` (path), `zkpassport_registry_contract` (path) |
| `examples/age_gate_contract` | `contract` | Minimal consumer example: an 18+ age-gate `claim()` using `verify_zkpassport_proof::<4>` + `emit_uniqueness_nullifier`. | `aztec`, `zkpassport`, `zkpassport_registry_contract` (path) |

TXE integration tests are colocated in the contract crates (upstream noir-contracts style):
`zkpassport_registry_contract/src/test.nr` covers admin/roles/pause, root updates/revoke/mode +
delayed visibility, and the private views; `examples/age_gate_contract/src/test.nr` runs one full
age-gate flow against an embedded real fixture. They compile/run only under `aztec test` (not
bare `aztec-nargo test`).

## Consumer quick-start

A consumer contract verifies a proof and mints its uniqueness nullifier in one call. From
`examples/age_gate_contract/src/main.nr`:

```noir
use zkpassport::verify::{
    emit_uniqueness_nullifier, ServiceConfig, verify_zkpassport_proof,
};
use zkpassport::commitments::age_commitment;

global MIN_AGE: u8 = 18;

/// Claim the 18+ badge: verifies a ZKPassport age proof (outer_count_4, one param
/// commitment = age(18, 0)) and burns the scoped nullifier — one claim per passport.
#[external("private")]
fn claim(user: AztecAddress) {
    let registry = self.storage.registry.read();
    let config = ServiceConfig {
        scope: 0, // fixture/demo: no domain binding; a real app pins sha256(domain) >> 8
        subscope: 0,
        validity_period: 7 * 86400,
        dev_mode: false,
    };
    let expected = [age_commitment(MIN_AGE, 0)];
    let verified = verify_zkpassport_proof::<4>(
        self.context, registry, user, config, expected,
    );
    emit_uniqueness_nullifier(self.context, verified.scoped_nullifier);
}
```

`verify_zkpassport_proof` reads its proof material from a private oracle **capsule**, not from
a function argument — the client is responsible for stashing `vk ‖ proof ‖ public_inputs` into
the app's capsule slot (`zkpassport_core::constants::PROOF_CAPSULE_SLOT`, `= 1`) before sending
the transaction. From `e2e/src/run-e2e.ts`:

```typescript
/** Must match zkpassport_core::constants::PROOF_CAPSULE_SLOT. */
const PROOF_CAPSULE_SLOT = new Fr(1n);
const VK_FIELDS = 115;
const PROOF_FIELDS = 458;

// ...

const blob = [...FIXTURE.vkeyFields, ...FIXTURE.proof, ...FIXTURE.publicInputs].map((h) => Fr.fromHexString(h));

const capsule = (fields: Fr[]) => new Capsule(ageGate.address, PROOF_CAPSULE_SLOT, fields, user as AztecAddress);

// ...

const [{ receipt }, claimSecs] = await timed('claim (private tx, client-IVC proving)', () =>
  ageGate.methods.claim(user).send({ from: user, capsules: [capsule(blob)], wait: WAIT }),
);
```

The capsule is scoped to `(app address, slot, user)` and is consumed unconstrained inside
`verify_zkpassport_proof` — everything downstream (recursive verification, scope/nullifier
checks, registry validity) constrains every field derived from it, so a malformed or malicious
capsule fails the proof rather than being trusted.

## Trust model

1. **Ethereum is the source of truth.** Certificate, circuit, and sanctions root sets are
   maintained by ZKPassport's L1 `RegistryInstance` contracts; this Aztec registry mirrors them,
   it does not originate policy.
2. **In M1, roots are oracle-pushed, not bridged.** `update_root` is an
   `#[external("public")]` function gated on an `oracle` role address set by `admin`; there is
   no L1→L2 message consumption yet. M2 scope is an L1→L2 bridge that feeds the same
   `update_root` write path, so the private verify path (and this library)
   would not need to change.
3. **All policy changes go through `DelayedPublicMutable` with a 24h delay — including
   revocation.** `set_revocation_status`, `set_root_validation_mode`, `set_validity_window`,
   `pause`/`unpause`, and the accepted-VK/OPRF-pubkey setters all call
   `schedule_value_change(..)`. A revoked or newly-invalid root therefore stays usable by
   private verifiers for up to 24h after the change lands — this is the same latency Aztec's
   `DelayedPublicMutable` privacy-optimal delay already implies, and it matches the 24h window
   the L1 registries run today (see the design spec's cross-cutting conclusions).
4. **TXE/`aztec-nargo test` no-op real recursion.** The `verify_proof_with_type`/
   `verify_honk_proof` opcode is not enforced under TXE simulation, so `aztec test` proves
   control flow and storage semantics only. **`bb verify` (the `test-harness/`) and the sandbox e2e
   (`e2e/`) are the only checks that exercise real proof verification** — the harness via native
   `bb prove`/`bb verify` on the wrapped core library, the e2e via a real client-IVC proof
   produced by the local PXE.
5. **Sanctions checking is opt-in, per service.** The registry's mandatory verify path
   (`assert_proof_valid`, called from `verify_zkpassport_proof`) only checks the certificate and
   circuit registries. A service that wants sanctions screening calls `check_sanctions`
   separately (which calls the registry's `assert_sanctions_root_valid` view) and folds
   `sanctions_commitment(root, is_strict)` into its own `expected_commitments`, mirroring L1's
   `VerifierHelper` split between the mandatory `SubVerifier` checks and app-side sanctions
   verification.
6. **The library verifies the *proof*, not the *claimant*.** `verify_zkpassport_proof` takes
   `user: AztecAddress` purely as the PXE capsule scope — no constraint ties the verified proof
   to `user`, to `msg_sender`, or to anything caller-specific. A ZKPassport proof capsule
   (`vk ‖ proof ‖ public_inputs`) is **bearer authorization**: whoever holds the blob (leaked for
   support, restored from a backup, handed to a third-party service) can load it into their own
   PXE under their own account and successfully verify it. Any app that grants anything of
   value — a badge, a mint, access — **must** fold
   `bind_user_address_commitment(user.to_field())` into its `expected_commitments` and require
   the ZKPassport request that produced the proof to have bound that same address; otherwise a
   leaked capsule lets a third party claim on the original holder's behalf, and the original
   holder can never claim again (their uniqueness nullifier is spent). This is the one file most
   integrators will copy verbatim — see `examples/age_gate_contract/src/main.nr`'s `claim` for
   the minimum caller-binding an app should do even without `bind_user_address_commitment`.

## Running the tests

Four layers, from least to most end-to-end. Run from `zkpassport.nr/` unless noted; set
`AZTEC=/mnt/user-data/martin/.aztec/versions/5.2.0` first.

```bash
# 1. Registry contract unit tests (pure logic: root_validation, guards) — no TXE needed
$AZTEC/bin/aztec-nargo test --package zkpassport_registry_contract

# 2. Core library unit tests (parse, commitments golden vectors) — no TXE needed
$AZTEC/bin/aztec-nargo test --package zkpassport_core

# 3. TXE integration tests (colocated in the contract crates) — REQUIRES `aztec test`, not
#    bare `aztec-nargo test`; these tests need the TXE server that `aztec test` starts (oracle
#    capsules, contract deployment, the embedded fixture, warp cheatcodes).
$AZTEC/bin/aztec test

# 4. Native bb prove/verify harness (the only nargo-test-layer check that enforces real
#    recursive verification) — from test-harness/, several minutes:
cd ../test-harness && ./run-harness.sh fixtures/outer_count_4_disclose.json
```

A fifth layer lives outside `zkpassport.nr/`: `e2e/` runs a full sandbox deploy + real
client-IVC `claim()` against a local Aztec network (`AztecNode` at `localhost:8080` by default).
It needs a running sandbox and native client-IVC proving (minutes-scale), and — like the TXE
suite — a fresh fixture (see below). Note step 4 above leaves you in `test-harness/`; `e2e/` is a
sibling of `test-harness/` and `zkpassport.nr/` under `packages/aztec/`.

**The workspace must be compiled first.** `e2e/src/artifacts/{ZKPassportRegistry,AgeGate}.ts`
are tracked files that `import` from `zkpassport.nr/target/<contract>.json`, and
`zkpassport.nr/target/` is gitignored — from a fresh clone the recipe below fails at module
resolution before a single line runs unless you compile first (and re-run `aztec codegen` if the
ABI changed, so the tracked artifact `.ts` files match the freshly compiled JSON):

```bash
# From zkpassport.nr/:
$AZTEC/bin/aztec-nargo compile
# Only if the contract ABI changed since the tracked e2e/src/artifacts/*.ts were generated:
$AZTEC/bin/aztec codegen target -o ../e2e/src/artifacts

cd ../e2e && npm install && npx tsx src/run-e2e.ts
```

## Fixture freshness

`test-harness/fixtures/*.json` and `examples/age_gate_contract/src/test/fixtures.nr` embed a real
ZKPassport `outer_count_4` proof whose `current_date` public input is checked against the
Aztec anchor-block timestamp with a 7-day `validity_period` (`ServiceConfig.validity_period`,
see the AgeGate example above). Both the age-gate TXE tests (`age_gate_contract`'s `src/test.nr`) and the sandbox e2e
consume that same embedded/loaded proof, so they must run **within ~6 days of fixture
regeneration** (a 1-day safety margin under the 7-day window) or the freshness assertions in
`zkpassport::verify::verify_zkpassport_proof` (`zkpassport/src/verify.nr:63-66` — `proof dated in
the future` / `proof too old`, checked against the private-context anchor-block timestamp) will
fail. Note `zkpassport_core::core::verify_outer_proof_core` does **not** check freshness itself —
its own doc comment says so explicitly (it has no `PrivateContext`, hence no notion of "now");
freshness is layered on top by the glue library, one level up.

Regenerate via `test-harness/gen-fixtures.sh [disclose|age]`, then `test-harness/fixture_to_noir.py` to
refresh the embedded TXE fixture. Fixture generation needs a **separate 5.0.1 toolchain
install** (`bb` 5.0.0-nightly, the build ZKPassport's production circuits were actually compiled
and proved with) — the 5.2.0 toolchain used everywhere else in this workspace is only used
afterwards, to verify the wrapper.

## Toolchain & dependency pins

| Component | Pin | Notes |
|---|---|---|
| Aztec toolchain | `v5.2.0` (`aztec-nargo`, `aztec test`, `bb` 5.2.0-nightly) | Everything under `zkpassport.nr/` and `e2e/` compiles/tests/runs against this. Path: `/mnt/user-data/martin/.aztec/versions/5.2.0`. |
| `aztec-nr` (the `aztec` crate) | git `https://github.com/AztecProtocol/aztec-nr`, tag `v5.2.0` | Depended on by `zkpassport_registry_contract`, `zkpassport`, `age_gate_contract`. |
| `bb_proof_verification` | git `https://github.com/AztecProtocol/aztec-packages/`, tag `v5.2.0`, dir `barretenberg/noir/bb_proof_verification` | `zkpassport_core`'s recursive-verification dependency. |
| `poseidon` | git `https://github.com/noir-lang/poseidon`, tag `v0.3.0` | Pinned for commitment parity with ZKPassport's own circuits; used by `zkpassport_core` and `zkpassport`. |
| ZKPassport `circuits` repo | sibling checkout `../../../../../circuits` (relative to `zkpassport_core/`, i.e. `/mnt/user-data/martin/circuits`) pinned at commit `1a1836eb958b7d7bbb47fab060128757748dba6a` | The commit the fixtures were built from. `zkpassport_core/Nargo.toml` depends on it via **path deps**: `utils`, `disclose_lib`, `bind_lib`, `compare_age_lib`, `exclusion_check_sanctions_lib` (see paths below). |
| `@zkpassport/utils` (TS) | `0.37.4` (pinned in the `circuits` repo's own `package.json`) | Used by `test-harness/fixture-gen.ts` and `test-harness/golden-vectors.ts`, both of which run with cwd = the `circuits` checkout. Not a dependency of `e2e/` or any Noir package. |
| `bb` (fixture generation only) | 5.0.0-nightly, from the separate `5.0.1` Aztec toolchain install | Matches the `bb` build ZKPassport's production circuits were compiled/proved with; required only by `test-harness/gen-fixtures.sh`, never by test/build commands above. |

`zkpassport_core/Nargo.toml`, verbatim:

```toml
[dependencies]
bb_proof_verification = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "v5.2.0", directory = "barretenberg/noir/bb_proof_verification" }
poseidon = { tag = "v0.3.0", git = "https://github.com/noir-lang/poseidon" }
utils = { path = "../../../../../circuits/src/noir/lib/utils" }
disclose_lib = { path = "../../../../../circuits/src/noir/lib/disclose" }
bind_lib = { path = "../../../../../circuits/src/noir/lib/bind" }
compare_age_lib = { path = "../../../../../circuits/src/noir/lib/compare/age" }
exclusion_check_sanctions_lib = { path = "../../../../../circuits/src/noir/lib/exclusion-check/sanctions" }
```

**PUBLISH BLOCKER:** the commitment libs above (`utils`, `disclose_lib`, `bind_lib`,
`compare_age_lib`, `exclusion_check_sanctions_lib`) are **path dependencies into a local sibling
checkout**, not git dependencies — nargo has no way to resolve them outside a machine that has
`/mnt/user-data/martin/circuits` checked out at (or after) `1a1836eb`. This workspace cannot be
published or consumed from another machine until ZKPassport cuts a **nargo-resolvable release
tag** (a tag on the `circuits` repo whose `Nargo.toml`s are fetchable via `git = "..."` deps) at
or after `1a1836eb`, at which point these five path deps switch to git deps pinned to that tag.
