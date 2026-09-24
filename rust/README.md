# zkpassport-core (Rust)

Native core for ZKPassport — a Rust port of the crypto/business-logic heart of
`@zkpassport/utils` (circuit input generation and its supporting primitives),
intended to become the single implementation shared by every platform:

| Consumer | Binding | Notes |
|---|---|---|
| iOS full app + **App Clip** | C ABI (`staticlib`) → Swift | Same pattern as `modules/facematch/rust` in the mobile app. The App Clip has no JS runtime, so this is the *only* way it can generate inputs |
| Android full app | JNI (`cdylib`) | Same pattern as `modules/dg2-crop/rust` |
| Web / Node (SDK, server) | `wasm-bindgen` → npm package | TS wrappers in `@zkpassport/utils` keep the existing API |
| React Native (full apps, JS side) | Expo native module over the C ABI/JNI | Hermes has no WebAssembly — mobile JS must go through the native module, not WASM |

## Ground rules

- **The TypeScript implementation is the oracle.** Every ported function is
  differential-tested against the TS output on generated vectors before
  anything consumes it. TS stays authoritative until a module is fully ported
  and proof-tested end-to-end.
- Data tables (`cms/oids.ts`, curve params, country maps — ~4.8k LOC) are
  *generated* into Rust constants, not hand-ported.
- Poseidon2 comes from the `taceo-poseidon2` crate (permutation only; same
  HorizenLabs parameter script as barretenberg) with the barretenberg sponge
  ported on top in `src/poseidon2.rs` — verified bit-identical to
  `@zkpassport/poseidon2` by the differential tests.

## Layout

```
rust/
  Cargo.toml               # workspace
  crates/zkpassport-core/  # pure logic, no FFI (bindings come later as sibling crates)
    src/barrett.rs         #   ported: barrett-reduction.ts
    src/bytes.rs           #   ported: pack*IntoField(s) from utils.ts
    src/poseidon2.rs       #   ported: @zkpassport/poseidon2 hash (sponge over taceo t4)
    tests/differential.rs  # asserts Rust output == TS oracle vectors
  scripts/gen-vectors.ts   # dumps oracle vectors from the TS source
  vectors/vectors.json     # generated; commit so CI can run cargo test without bun
```

## Commands

```sh
# regenerate oracle vectors (bun needs the utils tsconfig for decorators)
cd packages/zkpassport-utils && bun ../../rust/scripts/gen-vectors.ts

# run the differential tests
cd rust && cargo test
```

## Status: base + age input generation fully ported

Everything the App Clip age-verification PoC needs is differential-verified
against the TS oracle (both the john RSA-2048 and mary ECDSA-P256 fixtures):

- **Foundations** — poseidon2 (taceo t4 + bb sponge), barrett limbs, field packing,
  commitment/nullifier primitives, ECDSA low-s/DER normalization.
- **Builders** — `getIntegrityCheckCircuitInputs`, `getIDDataCircuitInputs`,
  `getDSCCircuitInputs` (incl. 549-leaf cert merkle tree, v1 leaf hashing,
  revocation/masterlist roots), `getAgeCircuitInputs` (+ salted values, scope hashes).
- **SOD parser** — `SOD.fromDER` ported on a zero-copy DER walker (`sod.rs`), every
  extracted field byte-identical to TS; named + specified curves; PSS salt lengths.
- **Composition** — `input_gen::generate_all_inputs`: raw SOD DER + DG1 + DG2 hash →
  all four circuit input sets, matching the TS pipeline end-to-end.
- **C ABI** — `zkpassport-ffi`: `zkpassport_generate_inputs` (JSON in/out),
  builds as staticlib for `aarch64-apple-ios`; the JSON contract is itself
  vector-tested (`tests/ffi_e2e.rs`).

Generated tables (never hand-edit): `curves_gen.rs`, `oids_gen.rs` — regenerate with
`bun ../../rust/scripts/gen-curves.ts` / `gen-oids.ts` from the utils package dir.

## Also done

- **CSCA matching** — AKI (from DSC TBS extensions) → `subject_key_identifier`,
  country-filtered, exact-match semantics (`registry::match_csca`); the TS
  signature-verification fallback is not ported yet.
- **Self-sufficient FFI** — the request can carry the full packaged-certs file;
  the core matches the CSCA, computes all leaf hashes, and hashes raw DG2 with
  the SOD's algorithm internally. Salts accepted as 0x-hex (Swift-friendly).
- **Swift wiring (prototype)** — `~/Projects/zkpassport-appclip-prototype`:
  `ZKCore.xcframework` (device+sim, built by `scripts/build-ios.sh`),
  bridging header, and `Clip/ZKInputGen.swift` (NFCPassportModel → request JSON
  → four input sets). Clip target builds with the Rust core linked.

- **Circuit selection** (`select.rs`) — passport → packaged-circuit names
  (`sig_check_dsc_tbs_*`, `sig_check_id_data_tbs_*`, `data_check_integrity_sa_*_dg_*`,
  `compare_age[_evm]`), ported from the *mobile app's* `src/lib/circuit-matcher.ts`
  name derivation and returned in the FFI response under `circuits`.
  NOTE: that logic currently lives app-side; its canonical home should be
  `@zkpassport/utils` (the browser prover needs it too) — the oracle in
  `gen-vectors.ts` is a verbatim replica until it migrates.

- **Fetch/prove plan** (`plan.rs`) — registry URL templates (certificates,
  manifest by version, packaged circuit by hash — ports of
  `@zkpassport/registry` constants), manifest parsing, per-circuit download
  plan, legacy integrity-name fallback, and the single-SRS sizing rule
  (bb v5: one SRS per process, max circuit size, 500k floor). Returned in the
  FFI response when a `manifest` is supplied.
- **WASM bindings** (`zkpassport-wasm`) — same JSON contract via wasm-bindgen
  for the browser prover (bb.js); builds for wasm32-unknown-unknown (1.1 MB).
- **Platform runner recipe** — the ONLY per-platform orchestration is 5 dumb
  steps (fetch certs+manifest → one core call → fetch circuits → SRS → prove
  in order). Reference implementation: `Clip/ZKProofRunner.swift` in the
  appclip prototype (~100 lines, zero decisions). Kotlin/browser runners
  follow the same shape inside the SDK; external SDK users only see
  query-in → result-out.

## Remaining for the PoC

1. On-device run: point the runner at a real circuit version + certs root
   (the root lookup from the registry contract is still a TS/RPC call — pin it
   for the PoC), wire `ZKProofRunner.run` into the clip flow UI, and scan a
   real passport end-to-end.
2. Fixture breadth: only RSA-2048/sha256-pkcs1 and ECDSA-P256/sha256 covered;
   RSA-PSS, SHA-1/384/512, brainpool, and RSA-3072/4096 need vectors + a
   real-passport pass before production.
3. Later: the app's brute-force signature-detection fallback for the ID-data
   circuit name (used when the declared algorithm fails verification), CSCA
   signature-verification fallback, remaining disclosure builders, OPRF,
   JNI + WASM bindings, TS wrappers in utils, and moving circuit selection
   from the app into utils as the canonical TS.
