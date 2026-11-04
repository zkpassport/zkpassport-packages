import { CredentialsClient } from "@zkpassport/onchain-credentials"
import type { CredentialIssueCall, CredentialsReadClient } from "@zkpassport/onchain-credentials"
import type { SupportedChain } from "@zkpassport/sdk"
import { buildCredentialProofRequest, type CredentialProofRequest } from "./credential-request"
import type { ZKPassportQRCodeOptions } from "./types"

// The card does not export its onResult payload type, so take it from the options.
type CardResult = Parameters<NonNullable<ZKPassportQRCodeOptions["onResult"]>>[0]

/**
 * Delivered to CredentialVerifyOptions.onResult once the card flow settles; the
 * popup's CredentialFlow turns it into the protocol's success message and, when
 * issueCall is present, into the mint transaction.
 */
export type CredentialVerifyResult = {
  /** Whether the proof checked out, per the card's verifier mode. This gates the mint. */
  verified: boolean
  /** The card's unmodified onResult payload, for anything the fields above don't cover. */
  raw: CardResult
  /** Ready-to-send issue() call; absent when the proof failed or carried no EVM outer proof. */
  issueCall?: CredentialIssueCall
}

// Passed to the card untouched; only onResult is wrapped, to add the issue() call.
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

/** Input to buildCredentialCardOptions; consumed by the hosted popup's CredentialFlow. */
export type CredentialVerifyOptions = ForwardedCardCallbacks & {
  client: CredentialsReadClient
  registryAddress: `0x${string}`
  policyId: bigint
  wallet: `0x${string}`
  chain: SupportedChain
  name?: string
  logo?: string
  purpose?: string
  onResult?: (result: CredentialVerifyResult) => void
}

/**
 * Resolve the policy from the credentials contract and build the
 * ZKPassportQRCodeOptions that make the existing QR card request exactly the
 * proof ZKPassportCredentials.issue() verifies for that policy.
 */
export async function buildCredentialCardOptions(
  options: CredentialVerifyOptions,
): Promise<ZKPassportQRCodeOptions> {
  const credentials = new CredentialsClient({
    client: options.client,
    address: options.registryAddress,
  })
  const request = await buildCredentialProofRequest(credentials, {
    policyId: options.policyId,
    wallet: options.wallet,
    chain: options.chain,
  })

  return {
    domain: request.domain,
    name: options.name,
    logo: options.logo,
    purpose: options.purpose,
    scope: request.scope,
    mode: "compressed-evm",
    devMode: request.devMode,
    // Verify in-page first and fall back to the hosted API, so a mint still gets a
    // verdict where that API is unreachable (local dev has no CORS grant).
    verifierMode: "auto",
    uniqueIdentifierType: request.uniqueIdentifierType,
    query: request.query,
    onReady: options.onReady,
    onRetryClicked: options.onRetryClicked,
    onBridgeConnect: options.onBridgeConnect,
    onRequestReceived: options.onRequestReceived,
    onGeneratingProof: options.onGeneratingProof,
    onProofGenerated: options.onProofGenerated,
    onReject: options.onReject,
    onError: options.onError,
    onResult: buildResultHandler(credentials, options, request),
  }
}

function buildResultHandler(
  credentials: CredentialsClient,
  options: CredentialVerifyOptions,
  request: CredentialProofRequest,
): (response: CardResult) => void {
  return (response) => {
    let issueCall: CredentialIssueCall | undefined
    const proof = response.proofs?.find((p) => p.name?.startsWith("outer_evm"))
    if (response.verified && proof) {
      try {
        const params = response.sdkInstance.getSolidityVerifierParameters({
          proof,
          domain: request.domain,
          scope: request.scope,
          devMode: request.evaluatorDevMode,
        })
        issueCall = credentials.buildIssueCall({ policyId: options.policyId, params })
      } catch (reason) {
        options.onError?.(reason instanceof Error ? reason.message : String(reason))
      }
    }
    options.onResult?.({ verified: response.verified, raw: response, issueCall })
  }
}
