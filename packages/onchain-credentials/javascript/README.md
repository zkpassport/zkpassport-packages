# ZKPassport Onchain Credentials

Typed [viem](https://viem.sh) bindings for the ZKPassport onchain credential registry
(`ZKPassportCredentials` and `PolicyEvaluatorV1`), whose Solidity sources live in
[`packages/onchain-credentials/contracts`](../contracts).

A credential is an ERC-1155 token a wallet holds for a *policy*. The policy declares what a
holder must prove — a minimum age, allowed or excluded nationalities, sanctions screening,
FaceMatch mode, nullifier type — and `issue()` mints only against a ZKPassport proof that
satisfies them.

## Installation

```bash
bun i @zkpassport/onchain-credentials
```

`@zkpassport/sdk` is a peer dependency: it produces the `ProofResult` that `issue()` verifies.

```bash
bun i @zkpassport/sdk
```

## Usage

### Reading a policy

```typescript
import { createCredentialsContext, getCredentialsChain } from "@zkpassport/onchain-credentials"

const { credentials } = createCredentialsContext(getCredentialsChain("ethereum_sepolia"))

const policy = await credentials.getPolicy(policyId)
const requirements = await credentials.getRequirements(policy)

const held = await credentials.hasCredential(wallet, policyId)
const expiresAt = await credentials.heldUntil(wallet, policyId)
```

### Minting a credential

The proof must have been generated for the policy's own scope, from `policyScope(policyId)`,
against the registry's `domain()`.

```typescript
import { submitIssueCall } from "@zkpassport/onchain-credentials"

const scope = await credentials.policyScope(policyId)
const domain = await credentials.domain()

const call = credentials.buildIssueCall({ policyId, proof, domain, scope })
const hash = await submitIssueCall(ctx, call, { client: walletClient, account })
```

Any sender works — the credential lands on the wallet the proof is bound to — so a relayer or
sponsored-gas flow can replace `submitIssueCall` without changing anything upstream.

### Creating and administering a policy

`CredentialsClient` assembles the owner operations as unsent viem calls, which
`submitCredentialsCall` sends:

```typescript
import { computePolicyId, encodeCredentialPolicyRequirements } from "@zkpassport/onchain-credentials"

const policyId = computePolicyId(owner, salt)
const call = credentials.buildCreatePolicyCall({
  salt,
  credentialDuration,
  requirements: encodeCredentialPolicyRequirements(requirements),
  metadataURL,
})
await submitCredentialsCall(ctx, call, { client: walletClient, account: owner })
```

The rest follow the same shape: `buildSetRequirementsCall`, `buildSetMetadataURLCall`,
`buildRetireCall`, `buildOwnerIssueCall`, `buildBanCall`, `buildUnbanCall`, and
`buildRenounceCall`.

## Deployments

Deployed registry addresses are listed in [`src/deployments.ts`](./src/deployments.ts) and
recorded under [`packages/onchain-credentials/contracts/deployments/`](../contracts/deployments).

## License

Apache-2.0
