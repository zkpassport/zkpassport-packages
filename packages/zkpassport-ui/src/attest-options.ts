import { AttestClient, NullifierType } from "@zkpassport/sdk"
import type {
  AttestPolicy,
  AttestReadClient,
  RequestedNullifierType,
  SupportedChain,
} from "@zkpassport/sdk"
import type { ZKPassportQRCodeDisplayOptions, ZKPassportQRCodeOptions } from "./types"

type CardResult = Parameters<NonNullable<ZKPassportQRCodeOptions["onResult"]>>[0]

export type AttestIssueCall = {
  address: `0x${string}`
  functionName: "issue"
  abi: ReturnType<AttestClient["getIssueDetails"]>["abi"]
  /** policyId plus the proof data pre-encoded per the policy's evaluator schema. */
  args: readonly [bigint, `0x${string}`]
}

export type AttestVerifyResult = {
  verified: boolean
  uniqueIdentifier?: string
  /** The unmodified SDK result payload. */
  raw: CardResult
  /**
   * Ready-to-send ZKPassportCredentials.issue() call; present when verified with
   * an EVM proof. The request's devMode must match the target chain: the app
   * roots proofs in the mainnet registries unless devMode is set, in which
   * case it uses the testnet registries — so testnet contracts only accept
   * dev-mode proofs and mainnet contracts only non-dev ones.
   */
  issueCall?: AttestIssueCall
}

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

export type AttestVerifyOptions = ForwardedCardCallbacks & {
  client: AttestReadClient
  registryAddress: `0x${string}`
  policyId: bigint
  wallet: `0x${string}`
  chain: SupportedChain
  /** Defaults to the registry's on-chain domain(), which issue() verifies against. */
  domain?: string
  devMode?: boolean
  /** Escape hatches: each supplied value skips its own on-chain read. */
  policy?: AttestPolicy
  scope?: string
  theme?: "light" | "dark" | "auto"
  display?: ZKPassportQRCodeDisplayOptions
  name?: string
  logo?: string
  purpose?: string
  onResult?: (result: AttestVerifyResult) => void
}

/**
 * Resolve a policy from the attest registry (unless supplied) and build the
 * ZKPassportQRCodeOptions that make the existing QR card request exactly the
 * proof ZKPassportCredentials.issue() verifies for that policy.
 */
export async function buildAttestCardOptions(
  options: AttestVerifyOptions,
): Promise<ZKPassportQRCodeOptions> {
  const attest = new AttestClient({ client: options.client, address: options.registryAddress })

  // On-chain reads keep each value byte-identical to what issue() verifies.
  const [policy, scope, domain] = await Promise.all([
    options.policy ?? attest.getPolicy(options.policyId),
    options.scope ?? attest.policyScope(options.policyId),
    options.domain ??
      (options.client.readContract({
        address: options.registryAddress,
        abi: attest.getIssueDetails().abi,
        functionName: "domain",
      } as never) as Promise<string>),
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
    theme: options.theme,
    display: options.display,
    name: options.name,
    logo: options.logo,
    purpose: options.purpose,
    scope,
    mode: "compressed-evm",
    devMode: options.devMode ?? false,
    // The hosted card verifies through the verifier API by default, but the
    // attest flow needs a verdict before minting even where that API is not
    // reachable (local dev has no CORS grant) — verify locally, API as backup.
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
