# attest-demo

Persona-by-persona demo of the ZKPassport attest registry on sepolia: a creator defines a policy, a
launcher deploys a gated MockAuction and shares links, a bidder verifies through the ZKPassport
popup (phone proof) and bids, a holder revokes their own credential, a guardian revokes anyone's.

## Prerequisites

- bun and foundry installed
- A sepolia wallet with test ETH (MetaMask)
- The ZKPassport root verifier address on sepolia
- The ZKPassport mobile app (real proofs; there is no mock mode)

## 1. Deploy the contracts (until a canonical deployment exists)

From `packages/attest-contracts`:

    ROOT_VERIFIER_ADDRESS=0x… \
    ATTEST_ADMIN_ADDRESS=0x…your-admin-wallet… \
    ATTEST_GUARDIAN_ADDRESS=0x…your-guardian-demo-wallet… \
    forge script script/DeployAttest.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast

The deployed registry address lands in `deployments/11155111.json`. `ATTEST_DOMAIN` defaults to
`zkpassport.id`; the popup reads the registry's on-chain `domain()`, so proofs match it
automatically.

## 2. Configure

    cp .env.example .env.local     # in packages/attest-demo
    # set NEXT_PUBLIC_REGISTRY_ADDRESS to the deployed registry

The popup app needs no configuration for its defaults.

## 3. Run both apps

    bun install                              # repo root
    bun --cwd packages/attest-popup dev      # port 3000
    bun --cwd packages/attest-demo dev       # port 3001

## 4. Demo script

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
