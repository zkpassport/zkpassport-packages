# attest-demo

Persona-by-persona demo of the ZKPassport attest registry on sepolia: a creator defines a policy, a
launcher deploys a gated MockAuction and shares links, a bidder verifies through the ZKPassport
popup (phone proof) and bids, a holder revokes their own credential, a guardian revokes anyone's.

## Prerequisites

- bun and foundry installed
- A sepolia wallet with test ETH (MetaMask)
- The ZKPassport mobile app (real proofs)

## Bring everything up

From the repo root:

    export SEPOLIA_RPC_URL=https://…                              # deploy only
    export ATTEST_ADMIN_ADDRESS=0x…your-admin-wallet…             # deploy only
    export ATTEST_GUARDIAN_ADDRESS=0x…your-guardian-demo-wallet…  # deploy only, optional
    packages/attest-demo/scripts/demo-up.sh --private-key 0x…

The script:

1. Deploys `ZKPassportAttest` to sepolia — skipped when
   `packages/attest-contracts/deployments/11155111.json` already exists. Extra arguments are
   forwarded to `forge script` for signing (`--private-key`, `--account`, …).
   `ROOT_VERIFIER_ADDRESS` defaults to the canonical root verifier
   `0x1D000001000EFD9a6371f4d90bB8920D5431c0D8`. `ATTEST_DOMAIN` defaults to `zkpassport.id`; the
   popup reads the registry's on-chain `domain()`, so proofs match it automatically.
2. Writes the deployed registry address into `packages/attest-demo/.env.local`
   (`NEXT_PUBLIC_REGISTRY_ADDRESS`). The popup app needs no configuration for its defaults.
3. Installs dependencies and starts attest-popup (port 3000) and attest-demo (port 3001).

## Demo script

1. **Creator** (`/creator`): create a policy (e.g. 18+, sanctions-clear).
2. **Launcher** (`/launcher`): pick the policy, deploy a MockAuction, copy the bidder link and the
   pre-launch verify link.
3. **Bidder** (bidder link): connect a wallet, "Verify with ZKPassport" (scan with the mobile app,
   mint from the popup), watch the gate flip, place a bid.
4. **Holder** (`/holder`): same wallet — revoke the credential.
5. Back on the bidder page: the gate is closed again.
6. **Guardian** (`/guardian`): connect the guardian wallet, revoke any wallet's credential.

## Tests

    bun --cwd packages/attest-demo test     # headless lib layer
    bun --cwd packages/attest-demo check    # lint + formatting
    bun run build                           # repo root, builds everything

## Regenerating lib/assets/mock-auction.ts

After changing `packages/attest-contracts/src/mocks/MockAuction.sol`, from the repo root:

    cd packages/attest-contracts && forge build --skip test && cd ../..
    bun packages/attest-demo/scripts/generate-mock-auction.mjs
    bunx prettier -w packages/attest-demo/lib/assets/mock-auction.ts

Commit the regenerated file. Never edit it by hand.
