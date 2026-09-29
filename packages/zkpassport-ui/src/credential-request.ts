import { NullifierType } from "@zkpassport/sdk"
import type { QueryBuilder, QueryBuilderResult, SupportedChain } from "@zkpassport/sdk"
import { getCredentialsChain, type CredentialsClient } from "@zkpassport/onchain-credentials"

/**
 * A policy's on-chain requirements translated into the proof request that its
 * issue() call verifies. Feed the fields into a proof request (e.g. the QR
 * card options) as they are; the query applies the policy's predicates and
 * the wallet + chain bindings.
 */
export type CredentialProofRequest = {
  /** The credentials contract's on-chain domain(), which issue() verifies the proof against. */
  domain: string
  /** The policy's proof scope, from policyScope(policyId). */
  scope: string
  /** Roots the proof in the testnet registries; follows the chain, not the evaluator's flag. */
  devMode: boolean
  /**
   * The `devMode` issue() carries, from the evaluator's on-chain flag. It only decides whether
   * mock-document proofs are accepted, and an evaluator that is not in dev mode reverts any
   * submission claiming it.
   */
  evaluatorDevMode: boolean
  /**
   * Nullifier type to request: the evaluator's uniqueIdentifierType for a
   * policy that enforces uniqueness; undefined leaves the request unconstrained
   * for any other policy.
   */
  uniqueIdentifierType?: NullifierType.NON_SALTED | NullifierType.SALTED
  query: (qb: QueryBuilder) => QueryBuilderResult
}

/**
 * Resolve a policy and translate its requirements into a CredentialProofRequest,
 * reading every value from the chain so the request derives from exactly what
 * issue() will enforce. Rejects retired policies before any proof is asked
 * for.
 */
export async function buildCredentialProofRequest(
  credentials: CredentialsClient,
  options: { policyId: bigint; wallet: `0x${string}`; chain: SupportedChain },
): Promise<CredentialProofRequest> {
  const [policy, scope, domain] = await Promise.all([
    credentials.getPolicy(options.policyId),
    credentials.policyScope(options.policyId),
    credentials.domain(),
  ])

  if (policy.retiredAt !== 0n) {
    throw new Error(`Policy ${options.policyId} is retired and no longer issues credentials.`)
  }

  // Requirements are opaque bytes whose schema the policy's evaluator owns;
  // decoding through the evaluator keeps the request derived from exactly
  // what issue() will enforce.
  const [requirements, evaluatorDevMode, uniqueIdentifierType] = await Promise.all([
    credentials.getRequirements(policy),
    credentials.getDevMode(policy),
    // The evaluator only checks the nullifier type for policies that enforce uniqueness.
    policy.enforceUniqueness ? credentials.getUniqueIdentifierType(policy) : NullifierType.NONE,
  ])
  const { wallet, chain } = options

  if (
    uniqueIdentifierType === NullifierType.NON_SALTED_MOCK ||
    uniqueIdentifierType === NullifierType.SALTED_MOCK
  ) {
    throw new Error(
      `Policy ${options.policyId} requires a mock nullifier type and cannot be minted.`,
    )
  }

  return {
    domain,
    scope,
    devMode: getCredentialsChain(chain).testnet === true,
    evaluatorDevMode,
    // NONE leaves the request unconstrained: the contract skips the type
    // check for non-unique policies, and a NONE nullifier cannot be requested.
    uniqueIdentifierType:
      uniqueIdentifierType === NullifierType.NONE ? undefined : uniqueIdentifierType,
    query: (qb) => {
      let q = qb
      if (requirements.minAge > 0) q = q.gte("age", requirements.minAge)
      // The contract stores ISO alpha-3 codes and compares them to the exact
      // lists committed in the proof.
      if (requirements.includedNationalities.length > 0) {
        q = q.in("nationality", [...requirements.includedNationalities] as never)
      }
      if (requirements.excludedNationalities.length > 0) {
        q = q.out("nationality", [...requirements.excludedNationalities] as never)
      }
      if (requirements.sanctionsMode) {
        q = q.sanctions("all", "all", { strict: requirements.sanctionsMode === "strict" })
      }
      // The SDK requires strict facematch whenever the salted nullifier is
      // used, so it overrides whatever the policy asks for (createPolicy
      // rejects the one contradictory pairing, a salted uniqueness policy
      // requiring regular).
      const facematchMode =
        uniqueIdentifierType === NullifierType.SALTED ? "strict" : requirements.facematchMode
      if (facematchMode) q = q.facematch(facematchMode)
      return q.bind("user_address", wallet).bind("chain", chain).done()
    },
  }
}
