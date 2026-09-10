import { NullifierType } from "@zkpassport/utils"
import type { SupportedChain } from "@zkpassport/utils"
import type { QueryBuilder, QueryBuilderResult } from "../types"
import type { AttestClient } from "./index"

/**
 * A policy's on-chain requirements translated into the proof request that its
 * issue() call verifies. Feed the fields into a proof request (e.g. the QR
 * card options) as they are; the query applies the policy's predicates and
 * the wallet + chain bindings.
 */
export type AttestProofRequest = {
  /** The registry's on-chain domain(), which issue() verifies the proof against. */
  domain: string
  /** The policy's proof scope, from policyScope(policyId). */
  scope: string
  /**
   * Nullifier type to request; undefined leaves the request unconstrained
   * (the policy requires none). A mock-type policy requests its real twin —
   * a dev-mode mock document then carries the mock type the contract
   * requires, since nullifier types match exactly on-chain with no folding.
   */
  uniqueIdentifierType?: NullifierType.NON_SALTED | NullifierType.SALTED
  query: (qb: QueryBuilder) => QueryBuilderResult
}

/**
 * Resolve a policy and translate its requirements into an AttestProofRequest,
 * reading every value from the chain so the request derives from exactly what
 * issue() will enforce. Rejects retired policies before any proof is asked
 * for.
 */
export async function buildAttestProofRequest(
  attest: AttestClient,
  options: { policyId: bigint; wallet: `0x${string}`; chain: SupportedChain },
): Promise<AttestProofRequest> {
  const [policy, scope, domain] = await Promise.all([
    attest.getPolicy(options.policyId),
    attest.policyScope(options.policyId),
    attest.domain(),
  ])

  if (policy.retiredAt !== 0n) {
    throw new Error(`Policy ${options.policyId} is retired and no longer issues credentials.`)
  }

  // Requirements are opaque bytes whose schema the policy's evaluator owns;
  // decoding through the evaluator keeps the request derived from exactly
  // what issue() will enforce.
  const requirements = await attest.getRequirements(policy)
  const { wallet, chain } = options

  return {
    domain,
    scope,
    uniqueIdentifierType: requestedNullifierType(requirements.uniqueIdentifierType),
    query: (qb) => {
      let q = qb
      if (requirements.minAge > 0) q = q.gte("age", requirements.minAge)
      // The registry stores ISO alpha-3 codes; the contract compares them to
      // the exact lists committed in the proof.
      if (requirements.includedNationalities.length > 0) {
        q = q.in("nationality", [...requirements.includedNationalities] as never)
      }
      if (requirements.excludedNationalities.length > 0) {
        q = q.out("nationality", [...requirements.excludedNationalities] as never)
      }
      if (requirements.sanctionsMode) {
        q = q.sanctions("all", "all", { strict: requirements.sanctionsMode === "strict" })
      }
      // The SDK requires strict facematch whenever a salted nullifier is
      // used, so it overrides whatever the policy asks for (createPolicy
      // rejects the contradictory pairings, salted types + regular).
      const facematchMode =
        requirements.uniqueIdentifierType === NullifierType.SALTED ||
        requirements.uniqueIdentifierType === NullifierType.SALTED_MOCK
          ? "strict"
          : requirements.facematchMode
      if (facematchMode) q = q.facematch(facematchMode)
      return q.bind("user_address", wallet).bind("chain", chain).done()
    },
  }
}

/**
 * The request can only name real nullifier types; a mock-type policy maps to
 * a request for its real twin, which a mock document (dev mode) then answers
 * with the mock type the policy requires — the contract matches types
 * exactly, with no folding. NONE stays unconstrained: the contract skips the
 * type check for those policies, and the app includes a non-salted nullifier
 * even when NONE is requested — the sdk's requested-type enforcement would
 * reject that mismatch.
 */
function requestedNullifierType(
  policyType: NullifierType,
): NullifierType.NON_SALTED | NullifierType.SALTED | undefined {
  if (policyType === NullifierType.NONE) return undefined
  if (policyType === NullifierType.NON_SALTED_MOCK) return NullifierType.NON_SALTED
  if (policyType === NullifierType.SALTED_MOCK) return NullifierType.SALTED
  return policyType as NullifierType.NON_SALTED | NullifierType.SALTED
}
