# @zkpassport/aztec

TS companion for the [`zkpassport_aztec_verifier`](../noir/verifier) Aztec verification
library.

## Install

```sh
npm install @zkpassport/aztec @aztec-labs/aztec.js@6.0 @aztec-labs/stdlib@6.0
```

`@aztec-labs/aztec.js` and `@aztec-labs/stdlib` are peer dependencies: the package works with Aztec
6.0.x and uses the app's own copies of them. Until the first stable release, install
`@zkpassport/aztec@beta`.

## Features

- **`ZKPassportRegistryArtifact` + `registerZKPassportRegistry(wallet, node, address)`**: utility to register the shared registry's artifact with the user's PXE (the verifier transitively `.view()`s it during local simulation/proving).
- **`assembleProofCapsule` / `assembleDiscloseCapsule` / `assembleSanctionsCapsule`**: the proof, the disclose preimage and the sanctions root must be passed via capsules to contracts that need to verify. These functions are conveniences to do so.
- **`nationalityBytes` / `packNationality` / `isIdCard`** — TS twins of the Noir `disclosed_data` module's nationality reader. `@zkpassport/utils`' `DisclosedData.fromDisclosedBytes(bytes, isIdCard(bytes) ? "id_card" : "passport")` reads every field.
- **`fetchOuterVk(vkeyHash)`**: the outer vk from the live `circuits2.zkpassport.id` host.
- **`constants.ts`** — TS mirror of `core/src/constants.nr`.

## Development

The package ships a copy of the compiled ZKPassportRegistry artifact without its Noir sources and
debug symbols, `registry/ZKPassportRegistry.json`. After a change to the registry, compile the Noir workspace with
the Aztec toolchain in `../.aztecrc` (see [the Noir README](../noir/README.md#running-the-tests))
and refresh the copy. CI fails while the copy's contract class differs from the compiled registry's.

```sh
cd ../noir && aztec compile && cd ../ts
bun scripts/registry-artifact.ts copy
```

Checks:

```sh
bun run typecheck
bun run test
```
