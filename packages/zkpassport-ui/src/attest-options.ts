import { AttestClient, NullifierType } from "@zkpassport/sdk"
import type {
  AttestPolicy,
  AttestReadClient,
  SolidityVerifierParameters,
  SupportedChain,
} from "@zkpassport/sdk"
import type { ZKPassportQRCodeDisplayOptions, ZKPassportQRCodeOptions } from "./types"

type CardResult = Parameters<NonNullable<ZKPassportQRCodeOptions["onResult"]>>[0]

export type AttestIssueCall = {
  address: `0x${string}`
  functionName: "issue"
  abi: ReturnType<AttestClient["getIssueDetails"]>["abi"]
  args: readonly [`0x${string}`, bigint, SolidityVerifierParameters]
}

export type AttestVerifyResult = {
  verified: boolean
  uniqueIdentifier?: string
  /** The unmodified SDK result payload. */
  raw: CardResult
  /**
   * Ready-to-send ZKPassportAttest.issue() call; present when verified with
   * an EVM proof on a non-dev request (dev-mode proofs revert on-chain).
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
 * proof ZKPassportAttest.issue() verifies for that policy.
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
    // Only uniqueness needs a nullifier to dedupe on; the contract accepts a
    // nullifier-free proof for non-unique policies regardless of their
    // saltedNullifierOnly flag, so those skip the nullifier and the face check.
    uniqueIdentifierType: policy.unique
      ? policy.saltedNullifierOnly
        ? NullifierType.SALTED
        : NullifierType.NON_SALTED
      : NullifierType.NONE,
    query: (qb) => {
      let q = qb
      if (policy.minAge > 0) q = q.gte("age", policy.minAge)
      if (policy.excludedCountries.length > 0) {
        // The registry stores ISO alpha-3 codes; the contract checks nationality.
        q = q.out("nationality", [...policy.excludedCountries] as never)
      }
      // The contract verifies sanctions proofs in strict mode.
      if (policy.sanctionsCheck) q = q.sanctions("all", "all", { strict: true })
      // The SDK requires strict facematch whenever the salted nullifier is used.
      if (policy.unique && policy.saltedNullifierOnly) q = q.facematch("strict")
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
    onResult: buildResultHandler({ attest, options, policyId, wallet, scope }),
  }
}

function buildResultHandler(context: {
  attest: AttestClient
  options: AttestVerifyOptions
  policyId: bigint
  wallet: `0x${string}`
  scope: string
}): (response: CardResult) => void {
  const { attest, options, policyId, wallet, scope } = context
  const devMode = options.devMode ?? false
  return (response) => {
    let issueCall: AttestIssueCall | undefined
    const proof = response.proofs?.find((p) => p.name?.startsWith("outer_evm"))
    // Dev-mode proofs revert on-chain, so no call is assembled for them.
    if (response.verified && proof && !devMode) {
      try {
        const params = response.sdkInstance.getSolidityVerifierParameters({
          proof,
          scope,
          devMode,
        })
        const details = attest.getIssueDetails()
        issueCall = {
          address: details.address,
          functionName: details.functionName,
          abi: details.abi,
          args: [wallet, policyId, params] as const,
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
