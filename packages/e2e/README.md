# @zkpassport/e2e

End-to-end tests across the ZKPassport stack, on a fork of Sepolia:

```
SDK request() → bridge → headless app → accept → proofs → done → SDK onSuccess → verify()
```

## What runs

- **SDK, utils, registry-sdk**: this repo's own code, built from the workspace.
- **Bridge relay**: the relay from `packages/bridge`, started in-process.
- **Headless app**: Node code in `src/` that parses the request URL, joins the bridge and proves the
  way zkpassport-mobile-app does, with noir_js + bb.js instead of the app's native provers. The
  mobile app itself is not tested here.
- **Chain**: anvil forking Sepolia. Requests are in dev mode and bind no chain, so the SDK and the
  headless app prove and verify on Sepolia, reading its registries through the fork: `verify()`
  takes anvil's URL through `config.rpcUrl`. Certificates, circuits and sanctions trees come from
  the testnet CDNs.
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

## Unpublished circuits

`LOCAL_CIRCUITS_DIR` runs the tests on circuits packaged in a circuits checkout instead of the
version on the testnet CDN:

```sh
# In a circuits checkout, after npm ci, with the nargo and bb versions it pins on PATH
circuits=(
  sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256
  sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256
  sig_check_dsc_tbs_700_ecdsa_nist_p256_sha256
  sig_check_id_data_tbs_700_ecdsa_nist_p256_sha256
  data_check_integrity_sa_sha256_dg_sha256
  compare_age
  disclose_bytes
  exclusion_check_sanctions
)
npx tsx src/ts/scripts/circuit-builder.ts generate
for circuit in "${circuits[@]}"; do nargo compile --force --package "$circuit"; done
npx tsx src/ts/scripts/circuit-packager.ts

# Here
LOCAL_CIRCUITS_DIR=<circuits checkout>/target/packaged bun run test:e2e
```
