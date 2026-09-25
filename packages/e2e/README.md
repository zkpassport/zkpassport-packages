# @zkpassport/e2e

End-to-end tests across the ZKPassport stack, on a local devnet:

```
SDK request() → bridge relay → app stand-in → accept → proofs → done → SDK onSuccess → verify()
```

- **SDK, utils, registry-sdk**: this repo's own code, built from the workspace.
- **Relay**:
  the bridge relay server (a private ZKPassport repo),
  started in-process.
- **App stand-in**: headless Node code in `src/`. It parses the request URL, joins the bridge and
  proves the way zkpassport-mobile-app does, but with noir_js + bb.js instead of the app's native
  provers. The circuit naming, salts and committed inputs are copied from the app, so they can drift
  from it. **The mobile app itself is not tested here.**
- **Registry**: anvil, with the registries deployed and seeded by
  `registry-contracts/script/test/*.sh`, plus a local file server for certificates and circuits. The
  SDK reads it through `new ZKPassport(domain, { network: "dev", registry })`.
- **Passport**: john, a ZKR mock passport, so verification runs with `devMode: true`.

## Running

```sh
bun install                 # from the repo root
bun run test:e2e            # builds the workspace packages it depends on, then runs the tests
```

Needs `anvil`, `forge` and `jq` on `PATH`, `registry-contracts` built (`forge build`, with the
`forge-std` submodule initialised) and access to the relay repo (below).

The first run downloads the 0.21.0 circuit manifest and the circuits it proves into `.cache/`
(gitignored). After that the tests run offline: they block any `fetch` that tries to leave the
machine, record it, and assert that the only one attempted is the SDK's dashboard lookup in
`request()`.

`test:e2e` is deliberately not called `test`, so the root `bun run test` does not run it. The deploy
scripts write `registry-contracts/broadcast/*/31337/run-latest.json` and read it back, so this must
not run at the same time as the registry-sdk tests.

## The relay is not a declared dependency

The relay repo is private and not on npm, so this package does not declare it. For local runs it is
added as an `optionalDependency` in a local-only commit that is never pushed. Without it installed,
the tests are skipped with a warning.

- **Never copy the relay's code into this repo**, and don't commit the dependency either. Installed,
  it lives only in `node_modules`, which is gitignored.
- This is a stopgap for local prototyping. Publishing the relay (or another route) is needed before
  this can run in CI or for external contributors.

## Notes

- **Fixture sizes**: the repo's large-file check rejects files over 1 MB. The largest circuit file,
  `compare_age` at 0.97 MB, is fetched into `.cache/` rather than committed. If the circuit files
  are ever committed as fixtures, they will be close to that limit.
- **Certificates**: the devnet serves `zkpassport-utils/tests/fixtures/root-certs-v1.json` (549
  certificates, including both ZKR CSCAs) as its certificate registry. That reaches into another
  package's test fixtures.
- **CI** (not set up yet): besides the relay, it would need a cached bb.js CRS, since bb.js
  downloads it outside `fetch`.
- **Scope**: fast mode, age ≥ 18 plus nationality disclosure, RSA CSCAs. Other queries, compressed
  mode, ECDSA passports and face match are not handled yet.
