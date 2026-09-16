# ZKPassport Onchain Credentials

Typed [viem](https://viem.sh) bindings for the ZKPassport onchain credentials contract
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

## Usage

### Reading a policy

```typescript
import { createCredentialsContext, getCredentialsChain } from "@zkpassport/onchain-credentials"

const ctx = createCredentialsContext(getCredentialsChain("ethereum_sepolia"))
const { credentials } = ctx

const policy = await credentials.getPolicy(policyId)
const requirements = await credentials.getRequirements(policy)
const devMode = await credentials.getDevMode(policy)

const held = await credentials.hasCredential(wallet, policyId)
const expiresAt = await credentials.heldUntil(wallet, policyId)
```

### Minting a credential

`issue()` takes the proof as `ProofVerificationParams`, which the SDK derives from a verified
proof.

```typescript
import { ZKPassport } from "@zkpassport/sdk"
import { submitIssueCall } from "@zkpassport/onchain-credentials"

const zkPassport = new ZKPassport("verify.zkpassport.id")

const scope = await credentials.policyScope(policyId)
const domain = await credentials.domain()

const params = zkPassport.getSolidityVerifierParameters({ proof, domain, scope })
const call = credentials.buildIssueCall({ policyId, params })
const txHash = await submitIssueCall(ctx, call, { client: walletClient, account })
```

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

## License

Apache-2.0
