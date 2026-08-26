# attest-popup

The ZKPassport verification popup for attest policies. A consumer dapp opens it via link or
`window.open`; the popup shows what the policy checks, connects the user's wallet, runs the proof
flow, and submits `ZKPassportAttest.issue()` from that wallet. The consumer detects completion by
refetching `balanceOf(wallet, policyId)` — there is no postMessage API.

## URL

    /?chain=<chain>&registry=0x…&policyId=<id>[&dev=1][&rpc=<url>]

- `chain`: `ethereum_sepolia` or `local` (anvil, chain id 31337)
- `dev=1`: dev-mode proof request; verifies but mints nothing
- `rpc`: RPC override, honored only with `dev=1` or in dev builds

## Develop

    bun install
    bun run dev          # from this package: next dev on :3000

Example:
http://localhost:3000/?chain=local&registry=0x5FbDB2315678afecb367f032d93F642f64180aa3&policyId=1&dev=1

## Local end-to-end against anvil

`issue()` checks the proof's bound chain id against `block.chainid`, and the SDK's `local` chain
maps to 31337 — anvil's default. So:

1. `anvil`
2. Deploy `ZKPassportAttest` + verifier stack from `packages/attest-contracts` and create a policy.
3. Point MetaMask at `http://127.0.0.1:8545` (chain id 31337).
4. Open the popup with `chain=local` and the deployed registry address.

`dev=1` exercises the whole UI without minting; a real phone-generated proof bound to `local`
exercises the mint end to end.
