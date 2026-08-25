import { AttestClient, NullifierType } from "@zkpassport/sdk"
import type {
  AttestPolicy,
  AttestReadClient,
  ProofResult,
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
  /** Ready-to-send ZKPassportAttest.issue() call; present when verified with an EVM proof. */
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
  domain?: string
  devMode?: boolean
  /** Escape hatches: supply BOTH to skip the on-chain fetch entirely. */
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
  const supplied = options.policy !== undefined && options.scope !== undefined
  const policy = supplied ? options.policy! : await attest.getPolicy(options.policyId)
  // On-chain read keeps the scope byte-identical to what issue() verifies.
  const scope = supplied ? options.scope! : await attest.policyScope(options.policyId)
  const { policyId, wallet, chain } = options

  return {
    domain: options.domain,
    theme: options.theme,
    display: options.display,
    name: options.name,
    logo: options.logo,
    purpose: options.purpose,
    scope,
    mode: "compressed-evm",
    devMode: options.devMode ?? false,
    ...(policy.saltedNullifierOnly ? { uniqueIdentifierType: NullifierType.SALTED } : {}),
    query: (qb) => {
      let q = qb
      if (policy.minAge > 0) q = q.gte("age", policy.minAge)
      if (policy.excludedCountries.length > 0) {
        // The registry stores ISO alpha-3 codes; the contract checks nationality.
        q = q.out("nationality", [...policy.excludedCountries] as never)
      }
      if (policy.sanctionsCheck) q = q.sanctions()
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
  return (response) => {
    let issueCall: AttestIssueCall | undefined
    const proof = (response.proofs as ProofResult[] | undefined)?.find((p) =>
      p.name?.startsWith("outer_evm"),
    )
    if (response.verified && proof) {
      try {
        const params = (
          response.sdkInstance as unknown as {
            getSolidityVerifierParameters: (args: {
              proof: ProofResult
              scope: string
              devMode: boolean
            }) => SolidityVerifierParameters
          }
        ).getSolidityVerifierParameters({ proof, scope, devMode: options.devMode ?? false })
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
