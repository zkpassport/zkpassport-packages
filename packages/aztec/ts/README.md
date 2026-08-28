# @zkpassport/aztec

TS companion for the [`zkpassport.nr`](../zkpassport.nr) Aztec verification
library — the app-side half that every consumer of the Noir library otherwise
rewrites. Private (path-consumed) until the aztec stack merges; publish is a
follow-up.

What it offers, mirroring the Noir side module-for-module:

- **`ZKPassportRegistryArtifact` + `registerZKPassportRegistry(wallet, node, address)`** —
  any app whose verifier calls `verify_zkpassport_proof*` must register the
  shared registry's artifact with the user's PXE (the verifier transitively
  `.view()`s it during local simulation/proving). The helper fetches the
  instance, **checks the artifact's contract class id against the on-chain
  instance** (a different `INITIAL_DELAY` is a different class), and registers —
  turning the cryptic claim-time "No artifact registered for contract class …"
  into an actionable error at startup.
- **`assembleProofCapsule` / `assembleDiscloseCapsule`** — build the
  `vk(115) ‖ proof(458) ‖ public_inputs(K+5)` blob for `PROOF_CAPSULE_SLOT` and
  the `mask(90) ‖ bytes(90)` disclose preimage for `DISCLOSE_CAPSULE_SLOT`,
  shape-checked (a wrong-shaped blob otherwise dies on-chain as a bare
  "missing zkpassport proof capsule"), with the SDK's bare-hex field encoding
  parsed correctly.
- **`nationalityBytes` / `packNationality` / `isIdCard`** — TS twins of the Noir
  `disclosed_data` module: layout-aware (TD3 passports @54 vs TD1 ID cards @45,
  keyed on the signed document code), raw un-normalized bytes (German documents
  disclose `D<<`). The test vectors in `test/` match the Noir unit tests
  literal-for-literal; keep both in lockstep.
- **`fetchOuterVk(vkeyHash)`** — the outer vk from the live
  `circuits2.zkpassport.id` host (the SDK's own helper still targets the dead
  legacy host).
- **`constants.ts`** — TS mirror of `zkpassport_core/src/constants.nr`.

Requires the Noir workspace compiled first (the artifact is imported from
`zkpassport.nr/target/`, which is gitignored):

```sh
cd ../zkpassport.nr && ~/.aztec/versions/5.2.0/bin/aztec compile
```

Checks:

```sh
npm run typecheck
npm test          # node:test, no network needed
```

Nationality queries must disclose `document_type` alongside `nationality` — the
in-circuit layout selection branches on the signed document code (see
`disclosed_data.nr`'s soundness note).
