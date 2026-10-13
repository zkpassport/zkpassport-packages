# @zkpassport/e2e

End-to-end tests across the ZKPassport stack, on a fork of Sepolia:

```
SDK request() → bridge → headless app → accept → proofs → done → SDK onSuccess → verify()
```

- `tests/fast-mode.test.ts`: age ≥ 18 and nationality disclosure.

## What runs

- **SDK, utils, registry-sdk**: this repo's own code, built from the workspace.
- **Bridge relay**: the relay from `packages/bridge`, started in-process.
- **Headless app**: Node code in `src/` that parses the request URL, joins the bridge and proves the
  way zkpassport-mobile-app does, with noir_js + bb.js instead of the app's native provers. The
  mobile app itself is not tested here.
- **Chain**: anvil forking Sepolia. Requests are in dev mode and bind no chain, so the SDK and the
  headless app prove and verify on Sepolia, reading its registries through the fork: `verify()`
  takes anvil's URL through `config.rpcUrl`. Certificates and circuits come from the testnet CDNs.
- **Passport**: John, `createMockPassport()` from `@zkpassport/utils/mock-passports`, a ZKR mock
  passport, so verification runs with `devMode: true`.

## Running

```sh
bun install                 # from the repo root
bun run test:e2e            # builds the workspace packages it depends on, then runs the tests
```

Needs `anvil` on `PATH`, and network access to a Sepolia RPC and the testnet CDNs. `SEPOLIA_RPC_URL`
replaces the registry-sdk's built-in Sepolia endpoint.

Once a request starts, `fetch` may only reach this machine and the testnet CDNs; the tests assert
that the SDK's dashboard lookup is the only call that tried to reach anything else.

The root `bun run test` does not run these tests.
