# @zkpassport/e2e

End-to-end tests across the ZKPassport stack, on a fork of Sepolia:

```
SDK request() → bridge relay → app stand-in → accept → proofs → done → SDK onSuccess → verify()
```

- `tests/fast-mode.test.ts`: age ≥ 18 and nationality disclosure.
- `tests/sanctions.test.ts`: the sanctions publisher's run on today's OpenSanctions data, then a
  sanctions request proved against the tree it published.

## What runs

- **SDK, utils, registry-sdk**: this repo's own code, built from the workspace.
- **Relay**: the bridge relay from `packages/bridge`, started in-process.
- **App stand-in**: headless Node code in `src/` that parses the request URL, joins the bridge and
  proves the way zkpassport-mobile-app does, with noir_js + bb.js instead of the app's native
  provers. It reads the registry of the request's chain and proves sanctions against the tree
  published for that registry's latest root. The mobile app itself is not tested here.
- **Chain**: anvil forking Sepolia. Requests are in dev mode and bind no chain, so the SDK and the
  stand-in prove and verify on Sepolia, reading its registries through the fork: `verify()` takes
  anvil's URL through `config.rpcUrl`. Certificates and circuits come from the testnet CDNs.
- **Sanctions publisher** (sanctions test only): the publisher's CLI, from a private ZKPassport
  repo, run as a child process. Anvil's second account becomes the Sanctions Registry's oracle on
  the fork, and the publisher publishes after Sepolia's own latest root. A local file server serves
  the published tree.
- **Passport**: John, `createMockPassport()` from `@zkpassport/utils/mock-passports`, a ZKR mock
  passport, so verification runs with `devMode: true`.

## Running

```sh
bun install                 # from the repo root
bun run test:e2e            # builds the workspace packages it depends on, then runs the tests
```

Needs `anvil` and `cast` on `PATH`, and network access to a Sepolia RPC and the testnet CDNs.
`SEPOLIA_RPC_URL` replaces the registry-sdk's built-in Sepolia endpoint. The sanctions test also
needs `SANCTIONS_PUBLISHER_DIR`, the publisher package of a checkout with its dependencies
installed, and is skipped with a warning without it; `OPENSANCTIONS_DATE` (YYYYMMDD) picks a day
other than today.

The day's snapshots are cached in `.cache/`, and the last sanctions run's packaged file, tree and
publisher log stay in `.cache/sanctions-run`. Once a request starts, `fetch` may only reach this
machine and the testnet CDNs; the tests assert that the SDK's dashboard lookup is the only call
that tried to reach anything else.

The root `bun run test` does not run these tests.
