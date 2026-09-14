import { CredentialsClient, buildCredentialProofRequest } from "@zkpassport/sdk/credentials"
import type { CredentialIssueCall, CredentialsReadClient } from "@zkpassport/sdk/credentials"
import type { SupportedChain } from "@zkpassport/sdk"
import type { ZKPassportQRCodeOptions } from "./types"

// The QR card does not export its onResult payload type, so extract it from
// the options; this stays in lockstep with whatever the card delivers.
type CardResult = Parameters<NonNullable<ZKPassportQRCodeOptions["onResult"]>>[0]

export type { CredentialIssueCall }

/**
 * Delivered to CredentialVerifyOptions.onResult once the card flow settles; the
 * popup's CredentialFlow turns it into the protocol's success message and, when
 * issueCall is present, into the mint transaction.
 */
export type CredentialVerifyResult = {
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
  issueCall?: CredentialIssueCall
}

// Every card callback except onResult, forwarded to the card verbatim;
// onResult is wrapped by buildCredentialCardOptions to enrich it with the issue()
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

/** Input to buildCredentialCardOptions; consumed by the hosted popup's CredentialFlow. */
export type CredentialVerifyOptions = ForwardedCardCallbacks & {
  client: CredentialsReadClient
  registryAddress: `0x${string}`
  policyId: bigint
  wallet: `0x${string}`
  chain: SupportedChain
  /** Defaults to false; must be true for testnet registries (proofs root in the testnet registry set). */
  devMode?: boolean
  name?: string
  logo?: string
  purpose?: string
  onResult?: (result: CredentialVerifyResult) => void
}

/**
 * Resolve the policy from the credentials registry and build the
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

  // The registry-semantics half — policy resolution and the requirements →
  // proof-request translation — lives in the SDK; this module only adds the
  // card presentation around it.
  const request = await buildCredentialProofRequest(credentials, {
    policyId: options.policyId,
    wallet: options.wallet,
    chain: options.chain,
  })

  const { policyId, wallet } = options

  return {
    domain: request.domain,
    name: options.name,
    logo: options.logo,
    purpose: options.purpose,
    scope: request.scope,
    mode: "compressed-evm",
    devMode: options.devMode ?? false,
    // The hosted card verifies through the verifier API by default, but the
    // credential flow needs a verdict before minting even where that API is not
    // reachable (local dev has no CORS grant) — so "auto": run the proof
    // verification in-page with the SDK's bundled verifier first, and fall
    // back to the hosted API only when the local check is not conclusive.
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
    onResult: buildResultHandler({
      credentials,
      options,
      policyId,
      wallet,
      scope: request.scope,
      domain: request.domain,
    }),
  }
}

function buildResultHandler(context: {
  credentials: CredentialsClient
  options: CredentialVerifyOptions
  policyId: bigint
  wallet: `0x${string}`
  scope: string
  domain: string
}): (response: CardResult) => void {
  const { credentials, options, policyId, wallet, scope, domain } = context
  const devMode = options.devMode ?? false
  return (response) => {
    let issueCall: CredentialIssueCall | undefined
    const proof = response.proofs?.find((p) => p.name?.startsWith("outer_evm"))
    if (response.verified && proof) {
      try {
        issueCall = credentials.buildIssueCall({ policyId, proof, domain, scope, devMode })
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
