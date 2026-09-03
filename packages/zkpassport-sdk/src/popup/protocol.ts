import type {
  NullifierType,
  ProofMode,
  ProofResult,
  Query,
  QueryResult,
  SupportedChain,
} from "@zkpassport/utils"
import type { SolidityVerifierParameters } from "../types"

export const DEFAULT_POPUP_URL = "https://verify.zkpassport.id"

/**
 * Attestation minting request. When present, the popup ignores the free-form
 * query and instead resolves the on-chain policy from the registry, binds the
 * recipient wallet and chain into the proof, and (when it can get a signer)
 * submits ZKPassportAttest.issue() itself.
 */
export type PopupAttestConfig = {
  /** Chain the registry lives on; also bound into the proof. */
  chain: SupportedChain
  /** On-chain policy id, as a 0x-prefixed 32-byte hex string. */
  policyId: `0x${string}`
  /** Credential recipient; bound into the proof, checked by issue(). */
  walletAddress: `0x${string}`
  /** ZKPassportAttest registry address. */
  registry: `0x${string}`
  /** RPC override for dev registries; the popup uses the chain default otherwise. */
  rpcUrl?: string
}

export type PopupRequestConfig = {
  name?: string
  logo?: string
  purpose?: string
  scope?: string
  mode?: ProofMode
  devMode?: boolean
  validity?: number
  uniqueIdentifierType?: NullifierType.NON_SALTED | NullifierType.SALTED
  oprfKeyId?: string
  attest?: PopupAttestConfig
}

/**
 * Ready-to-send ZKPassportAttest.issue() call. `abi` is the registry ABI as
 * plain data — cast it for your client (e.g. viem's `Abi`); the popup keeps
 * this type dependency-free so relying parties don't inherit viem's types.
 */
export type PopupAttestIssueCall = {
  address: `0x${string}`
  functionName: "issue"
  abi: readonly unknown[]
  args: readonly [`0x${string}`, bigint, SolidityVerifierParameters]
}

/**
 * issue() checks the wallet bound into the proof, not the transaction sender,
 * so an "unminted" issueCall may be submitted by any account the RP controls.
 */
export type PopupAttestOutcome =
  | { status: "minted"; txHash: `0x${string}`; issueCall: PopupAttestIssueCall }
  | { status: "unminted"; reason?: string; issueCall: PopupAttestIssueCall }
  | { status: "already-verified" }

export type PopupConfigureMessage = {
  zkpassport: true
  type: "configure"
  request: PopupRequestConfig
  query: Query
}

export type PopupReadyMessage = { zkpassport: true; type: "ready" }

export type PopupEventMessage =
  | { zkpassport: true; type: "request-received" }
  | { zkpassport: true; type: "generating" }
  | {
      zkpassport: true
      type: "proof-generated"
      index?: number
      total?: number
      name?: string
    }
  | {
      zkpassport: true
      type: "success"
      proofs: ProofResult[]
      result: QueryResult
      attest?: PopupAttestOutcome
    }
  | { zkpassport: true; type: "rejected" }
  | { zkpassport: true; type: "error"; message: string }

export type PopupMessage = PopupConfigureMessage | PopupReadyMessage | PopupEventMessage

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPopupMessage(data: any): data is PopupMessage {
  return !!data && data.zkpassport === true && typeof data.type === "string"
}
