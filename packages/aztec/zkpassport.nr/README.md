# zkpassport.nr

An Aztec v5.2.0 Noir workspace: the `ZKPassportRegistry` contract plus a `zkpassport_aztec`
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
members = ["zkpassport_registry_contract", "zkpassport_core", "zkpassport_aztec", "examples/age_gate_contract"]
```

| Package | Type | Purpose | Key dependencies |
|---|---|---|---|
| `zkpassport_registry_contract` | `contract` | The registry. Roles (`admin`/`oracle`/`guardian`) are plain `PublicMutable` — writes take effect instantly (`main.nr:24-26`). Everything else — `paused`, per-registry root sets (certificate/circuit/sanctions) with validity windows and revocation, the version-keyed accepted-VK sets with their per-version enabled flags, and the OPRF pubkey hash — is `DelayedPublicMutable` (24h delay). Exposes `update_root` (oracle), admin policy setters, and private `#[view]` functions (`assert_proof_valid`, `assert_sanctions_root_valid`, `assert_root_valid_at_timestamp`) that verifiers call. | `aztec` (git, tag `v5.2.0`) |
| `zkpassport_core` | `lib` | Pure, no-`aztec`-dependency core: outer-proof recursion (`verify_outer_proof_core`), public-input parsing, and commitment wrappers (`age_commitment`, `disclose_commitment`, `sanctions_commitment`, `bind_user_address_commitment`) over the ZKPassport circuits' own Noir libs. This crate is what the `test-harness/` proves against natively (no TXE needed). | `bb_proof_verification` (git, tag `v5.2.0`), `poseidon` (git, tag `v0.3.0`), plus the ZKPassport `circuits` commitment libs (git, tag `noir-v1.0.0-beta.22`) — see Pins below |
| `zkpassport_aztec` | `lib` | The glue apps actually depend on: re-exports `zkpassport_core`, and adds `verify.nr` — `ServiceConfig`, `verify_zkpassport_proof::<K>`, capsule loaders (`load_disclose_payload`), `check_sanctions`, `emit_uniqueness_nullifier`. This is the only crate consumer contracts should import. | `aztec`, `poseidon`, `zkpassport_core` (path), `zkpassport_registry_contract` (path) |
| `examples/age_gate_contract` | `contract` | Minimal consumer example: an 18+ age-gate `claim()` using `verify_zkpassport_proof::<5>` (age + bind commitments) + `emit_uniqueness_nullifier`, granting a public soulbound badge (`has_badge`). | `aztec`, `zkpassport_aztec`, `zkpassport_registry_contract` (path) |

TXE integration tests are colocated in the contract crates (upstream noir-contracts style):
`zkpassport_registry_contract/src/test.nr` covers admin/roles/pause, root updates/revoke/mode +
delayed visibility, and the private views; `examples/age_gate_contract/src/test.nr` runs one full
age-gate flow against an embedded real fixture. They compile/run only under `aztec test` (not
bare `aztec-nargo test`).

## Consumer quick-start

A consumer contract verifies a proof and mints its uniqueness nullifier in one call. From
`examples/age_gate_contract/src/main.nr`:

```noir
use zkpassport_aztec::verify::{
    emit_uniqueness_nullifier, ServiceConfig, verify_zkpassport_proof,
};
use zkpassport_aztec::commitments::{age_commitment, bind_user_address_commitment};

global MIN_AGE: u8 = 18;

/// Claim the 18+ badge for `user`: verifies a ZKPassport proof (outer_count_5, param
/// commitments = {age(18, 0), bind(user)}), burns the scoped nullifier — one claim per
/// passport — and grants `user` a public soulbound badge. The bind commitment ties the
/// proof itself to `user`, so anyone — a relayer included — may submit the transaction.
#[external("private")]
fn claim(user: AztecAddress) {
    let registry = self.storage.registry.read();
    let config = ServiceConfig {
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

// The capsule is scoped to the SENDING account; the claim goes to the address the proof
// is bound to, which needs no account of its own.
const boundUser = AztecAddress.fromFieldUnsafe(Fr.fromHexString(FIXTURE.bindAddress));
const capsule = (fields: Fr[]) => new Capsule(ageGate.address, PROOF_CAPSULE_SLOT, fields, user as AztecAddress);

// ...

const [{ receipt }, claimSecs] = await timed('claim (private tx, client-IVC proving)', () =>
  ageGate.methods.claim(boundUser).send({ from: user, capsules: [capsule(blob)], wait: WAIT }),
);
```

The capsule is scoped to `(app address, slot, sender)` and is consumed unconstrained inside
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
   `pause`/`unpause`, and the accepted-VK/version-status/OPRF-pubkey setters all call
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
6. **The library verifies the *proof*; binding it to a claimant is the app's job.**
   `verify_zkpassport_proof` takes `capsule_scope: AztecAddress` purely as the PXE capsule
   scope (the sender's account) — no constraint ties the verified proof to that scope, to
   `msg_sender`, or to anything caller-specific. A ZKPassport proof capsule
   (`vk ‖ proof ‖ public_inputs`) is otherwise **bearer authorization**: whoever holds the blob
   (leaked for support, restored from a backup, handed to a third-party service) can load it
   into their own PXE under their own account and successfully verify it. The fix is what the
   example does: fold `bind_user_address_commitment(user.to_field())` into
   `expected_commitments` and have the ZKPassport request that produced the proof bind that
   same address — then a leaked capsule authorizes nothing for anyone else, and any relayer
   may submit the transaction on the bound user's behalf.
   `examples/age_gate_contract/src/main.nr`'s `claim` is the pattern to copy; its
   `claim_for_unbound_address_fails` TXE test is the negative control.

## Running the tests

Four layers, from least to most end-to-end. Run from `zkpassport.nr/` unless noted; set
`AZTEC=/mnt/user-data/martin/.aztec/versions/5.2.0` first.

```bash
# 1. Registry contract unit tests (pure logic: root_validation, guards) — no TXE needed
$AZTEC/bin/aztec-nargo test --package zkpassport_registry_contract

# 2. Core library unit tests (parse, commitment fixtures) — no TXE needed
$AZTEC/bin/aztec-nargo test --package zkpassport_core

# 3. TXE integration tests (colocated in the contract crates) — REQUIRES `aztec test`, not
#    bare `aztec-nargo test`; these tests need the TXE server that `aztec test` starts (oracle
#    capsules, contract deployment, the embedded fixture, warp cheatcodes).
$AZTEC/bin/aztec test

# 4. Native bb prove/verify harness (the only nargo-test-layer check that enforces real
#    recursive verification) — from test-harness/, several minutes:
cd ../test-harness && ./test-recursive-verification.sh fixtures/outer_count_4_disclose.json
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

`test-harness/fixtures/*.json` and `zkpassport_core/src/fixtures/proof.nr` embed real
ZKPassport outer proofs whose `current_date` public input is checked against the
Aztec anchor-block timestamp with a 7-day `validity_period` (`ServiceConfig.validity_period`,
see the AgeGate example above). The fixtures are deliberately **future-dated to 2050-01-01**
(`FIXTURE_NOW` in `test-harness/generate-proof-fixtures.ts`): the TXE and sandbox clocks can only
move forward, so a wall-clock-dated fixture would expire ~6 days after generation, while the
future-dated one stays verifiable until 2050 — the TXE test and the e2e warp their clocks
forward into its freshness window. The assertions (`proof dated in the future` / `proof too
old`) live in `zkpassport_aztec::verify::verify_zkpassport_proof`, checked against the
private-context anchor-block timestamp. Note `zkpassport_core::verify::verify_outer_proof_core`
does **not** check freshness itself — its own doc comment says so explicitly (it has no
`PrivateContext`, hence no notion of "now"); freshness is layered on top by the glue library.

One budget remains, per sandbox instance: e2e warps are cumulative on a running sandbox, so one
instance supports ~5 e2e runs before its clock leaves the fixture's 7-day window — restart the
sandbox to reset (the next run re-warps to the fixture-anchored target).

Regenerate via `test-harness/generate-proof-fixtures.sh [disclose|age]`, then `test-harness/fixture-to-noir.ts` to
refresh the embedded TXE fixture. Fixture generation needs a **separate 5.0.1 toolchain
install** (`bb` 5.0.0-nightly, the build ZKPassport's production circuits were actually compiled
and proved with) — the 5.2.0 toolchain used everywhere else in this workspace is only used
afterwards, to verify the wrapper.

## Toolchain & dependency pins

| Component | Pin | Notes |
|---|---|---|
| Aztec toolchain | `v5.2.0` (`aztec-nargo`, `aztec test`, `bb` 5.2.0-nightly) | Everything under `zkpassport.nr/` and `e2e/` compiles/tests/runs against this. Path: `/mnt/user-data/martin/.aztec/versions/5.2.0`. |
| `aztec-nr` (the `aztec` crate) | git `https://github.com/AztecProtocol/aztec-packages/`, tag `v5.2.0`, dir `noir-projects/aztec-nr/aztec` | Depended on by `zkpassport_registry_contract`, `zkpassport_aztec`, `age_gate_contract`. Sourced from the monorepo (not the `aztec-nr` mirror) so all members share one `aztec` source. |
| `bb_proof_verification` | git `https://github.com/AztecProtocol/aztec-packages/`, tag `v5.2.0`, dir `barretenberg/noir/bb_proof_verification` | `zkpassport_core`'s recursive-verification dependency. |
| `poseidon` | git `https://github.com/noir-lang/poseidon`, tag `v0.3.0` | Pinned for commitment parity with ZKPassport's own circuits; used by `zkpassport_core` and `zkpassport_aztec`. |
| ZKPassport `circuits` repo | git `https://github.com/zkpassport/circuits`, tag `noir-v1.0.0-beta.22` (= `d3a75acb`) | `zkpassport_core`'s commitment libs: `utils`, `disclose_lib`, `bind_lib`, `compare_age_lib`, `exclusion_check_sanctions_lib`. The proof fixtures are generated from the `test-harness/circuits` **submodule**, pinned at `1a1836eb`; the tag's only delta vs that commit is one additive, unused global in `utils` (the commitment-fixture tests confirm identical commitments). Only fixture regeneration (`test-harness/generate-proof-fixtures.sh`) needs the submodule initialized — building/testing the workspace does not. |
| `@zkpassport/utils` (TS) | `0.37.4` (this repo's `packages/zkpassport-utils` workspace package) | `test-harness/generate-commitment-fixtures.ts` imports it from the workspace (`bun i && bun run --cwd packages/zkpassport-utils build` first). `test-harness/generate-proof-fixtures.ts` imports it from the `circuits` submodule's own node_modules, which pins the same version. Not a dependency of `e2e/` or any Noir package. |
| `bb` (fixture generation only) | 5.0.0-nightly, from the separate `5.0.1` Aztec toolchain install | Matches the `bb` build ZKPassport's production circuits were compiled/proved with; required only by `test-harness/generate-proof-fixtures.sh`, never by test/build commands above. |

`zkpassport_core/Nargo.toml`, verbatim:

```toml
[dependencies]
bb_proof_verification = { git = "https://github.com/AztecProtocol/aztec-packages/", tag = "v5.2.0", directory = "barretenberg/noir/bb_proof_verification" }
poseidon = { tag = "v0.3.0", git = "https://github.com/noir-lang/poseidon" }
utils = { git = "https://github.com/zkpassport/circuits", tag = "noir-v1.0.0-beta.22", directory = "src/noir/lib/utils" }
disclose_lib = { git = "https://github.com/zkpassport/circuits", tag = "noir-v1.0.0-beta.22", directory = "src/noir/lib/disclose" }
bind_lib = { git = "https://github.com/zkpassport/circuits", tag = "noir-v1.0.0-beta.22", directory = "src/noir/lib/bind" }
compare_age_lib = { git = "https://github.com/zkpassport/circuits", tag = "noir-v1.0.0-beta.22", directory = "src/noir/lib/compare/age" }
exclusion_check_sanctions_lib = { git = "https://github.com/zkpassport/circuits", tag = "noir-v1.0.0-beta.22", directory = "src/noir/lib/exclusion-check/sanctions" }
```

All dependencies are git-pinned (nargo git deps require a tag or branch name — bare commit
SHAs don't resolve), so the workspace builds on any machine with no sibling checkouts.
