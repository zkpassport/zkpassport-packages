# @zkpassport/aztec

TS companion for the [`zkpassport_aztec_verifier`](../noir/verifier) Aztec verification
library.

Features:

- **`ZKPassportRegistryArtifact` + `registerZKPassportRegistry(wallet, node, address)`**: utility to register the shared registry's artifact with the user's PXE (the verifier transitively `.view()`s it during local simulation/proving).
- **`assembleProofCapsule` / `assembleDiscloseCapsule`**: the proof and disclose preimage must be passed via capsules to contracts that need to verify. These functions are conveniences to do so.
- **`nationalityBytes` / `packNationality` / `isIdCard`** — TS twins of the Noir `disclosed_data` module.
- **`fetchOuterVk(vkeyHash)`**: the outer vk from the live `circuits2.zkpassport.id` host.
- **`constants.ts`** — TS mirror of `core/src/constants.nr`.

Requires the Noir workspace compiled first with the Aztec toolchain in `../.aztecrc` active:
`aztec-up install "$(cat ../.aztecrc)"` once, then `eval "$(aztec-up env)"` in a new shell (see
[the Noir README](../noir/README.md#running-the-tests)).
With another version active, `aztec compile` fails on aztec-nr itself, with errors such as
`Could not resolve 'StructField'`. The artifact is imported from `noir/target/`, which is gitignored:

```sh
cd ../noir && aztec compile
```

Checks:

```sh
npm run typecheck
npm test          # node:test, no network needed
```
