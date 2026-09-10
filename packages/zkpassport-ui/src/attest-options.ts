import { AttestClient, NullifierType } from "@zkpassport/sdk"
import type { AttestReadClient, RequestedNullifierType, SupportedChain } from "@zkpassport/sdk"
import type { ZKPassportQRCodeOptions } from "./types"

// The QR card does not export its onResult payload type, so extract it from
// the options; this stays in lockstep with whatever the card delivers.
type CardResult = Parameters<NonNullable<ZKPassportQRCodeOptions["onResult"]>>[0]

/**
 * Ready-to-send ZKPassportCredentials.issue() call, assembled from the SDK's
 * issue details so an onResult consumer can submit the mint without wiring up
 * ABIs itself. `address` is the registry address; the field keeps viem's
 * naming so the object spreads straight into writeContract/simulateContract.
 */
export type AttestIssueCall = {
  address: `0x${string}`
  functionName: "issue"
  abi: ReturnType<AttestClient["getIssueDetails"]>["abi"]
  /** policyId plus the proof data pre-encoded per the policy's evaluator schema. */
  args: readonly [bigint, `0x${string}`]
}

/**
 * Delivered to AttestVerifyOptions.onResult once the card flow settles; the
 * popup's AttestFlow turns it into the protocol's success message and, when
 * issueCall is present, into the mint transaction.
 */
export type AttestVerifyResult = {
  /** Whether the proof checked out (per the card's verifier mode) — the verdict gating a mint. */
  verified: boolean
  /** The proof's nullifier-derived unique identifier; present when verified and the policy requests one. */
  uniqueIdentifier?: string
  /**
   * The card's unmodified onResult payload (proofs, query result, verdict) for
   * consumers that need more than the distilled fields above.
   */
  raw: CardResult
  /**
   * Ready-to-send ZKPassportCredentials.issue() call; present when the
   * verification produced an EVM-verifiable outer proof (the card requests
   * mode "compressed-evm", so this is absent only on failure or non-EVM
   * results).
   */
  issueCall?: AttestIssueCall
}

// Every card callback except onResult, forwarded to the card verbatim;
// onResult is wrapped by buildAttestCardOptions to enrich it with the issue()
// call. Pick reuses the card's own types, so nothing is redeclared.
type ForwardedCardCallbacks = Pick<
  ZKPassportQRCodeOptions,
  | "onReady"
  | "onRetryClicked"
  | "onBridgeConnect"
  | "onRequestReceived"
  | "onGeneratingProof"
  | "onProofGenerated"
  | "onReject"
  | "onError"
>

/** Input to buildAttestCardOptions; consumed by the hosted popup's AttestFlow. */
export type AttestVerifyOptions = ForwardedCardCallbacks & {
  client: AttestReadClient
  registryAddress: `0x${string}`
  policyId: bigint
  wallet: `0x${string}`
  chain: SupportedChain
  /** Defaults to false; must be true for testnet registries (proofs root in the testnet registry set). */
  devMode?: boolean
  name?: string
  logo?: string
  purpose?: string
  onResult?: (result: AttestVerifyResult) => void
}

/**
 * Resolve the policy from the attest registry and build the
 * ZKPassportQRCodeOptions that make the existing QR card request exactly the
 * proof ZKPassportCredentials.issue() verifies for that policy.
 */
export async function buildAttestCardOptions(
  options: AttestVerifyOptions,
): Promise<ZKPassportQRCodeOptions> {
  const attest = new AttestClient({ client: options.client, address: options.registryAddress })

  // On-chain reads keep each value byte-identical to what issue() verifies.
  const [policy, scope, domain] = await Promise.all([
    attest.getPolicy(options.policyId),
    attest.policyScope(options.policyId),
    options.client.readContract({
      address: options.registryAddress,
      abi: attest.getIssueDetails().abi,
      functionName: "domain",
    } as never) as Promise<string>,
  ])

  if (policy.retiredAt !== 0n) {
    throw new Error(`Policy ${options.policyId} is retired and no longer issues credentials.`)
  }

  // Requirements are opaque bytes whose schema the policy's evaluator owns;
  // decoding through the evaluator keeps the request derived from exactly
  // what issue() will enforce.
  const requirements = await attest.getRequirements(policy)

  const { policyId, wallet, chain } = options

  return {
    domain,
    name: options.name,
    logo: options.logo,
    purpose: options.purpose,
    scope,
    mode: "compressed-evm",
    devMode: options.devMode ?? false,
    // The hosted card verifies through the verifier API by default, but the
    // attest flow needs a verdict before minting even where that API is not
    // reachable (local dev has no CORS grant) — so "auto": run the proof
    // verification in-page with the SDK's bundled verifier first, and fall
    // back to the hosted API only when the local check is not conclusive.
    verifierMode: "auto",
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
    onReady: options.onReady,
    onRetryClicked: options.onRetryClicked,
    onBridgeConnect: options.onBridgeConnect,
    onRequestReceived: options.onRequestReceived,
    onGeneratingProof: options.onGeneratingProof,
    onProofGenerated: options.onProofGenerated,
    onReject: options.onReject,
    onError: options.onError,
    onResult: buildResultHandler({ attest, options, policyId, wallet, scope, domain }),
  }
}

/**
 * The request can only name real nullifier types; a mock-type policy maps to a request for its
 * real twin, which a mock document (dev mode) then answers with the mock type the policy
 * requires — the contract matches types exactly, with no folding. NONE stays unconstrained:
 * the contract skips the type check for those policies, and the app includes a non-salted
 * nullifier even when NONE is requested — the sdk's requested-type enforcement would reject
 * that mismatch.
 */
function requestedNullifierType(policyType: NullifierType): RequestedNullifierType | undefined {
  if (policyType === NullifierType.NONE) return undefined
  if (policyType === NullifierType.NON_SALTED_MOCK) return NullifierType.NON_SALTED
  if (policyType === NullifierType.SALTED_MOCK) return NullifierType.SALTED
  return policyType
}

function buildResultHandler(context: {
  attest: AttestClient
  options: AttestVerifyOptions
  policyId: bigint
  wallet: `0x${string}`
  scope: string
  domain: string
}): (response: CardResult) => void {
  const { attest, options, policyId, wallet, scope, domain } = context
  const devMode = options.devMode ?? false
  return (response) => {
    let issueCall: AttestIssueCall | undefined
    const proof = response.proofs?.find((p) => p.name?.startsWith("outer_evm"))
    if (response.verified && proof) {
      try {
        const proofData = AttestClient.getIssueProofData({ proof, domain, scope, devMode })
        const details = attest.getIssueDetails()
        issueCall = {
          address: details.address,
          functionName: details.functionName,
          abi: details.abi,
          args: [policyId, proofData] as const,
        }
      } catch (reason) {
        options.onError?.(reason instanceof Error ? reason.message : String(reason))
      }
    }
    options.onResult?.({
      verified: response.verified,
      uniqueIdentifier: response.uniqueIdentifier,
      raw: response,
      issueCall,
    })
  }
}
