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
 * query and instead resolves the on-chain policy from the registry, has the
 * user connect a wallet and pick the recipient account, binds that account
 * and the chain into the proof, and submits ZKPassportAttest.issue() itself.
 * The recipient is chosen in the popup, not by the relying party; the outcome
 * reports which account was used.
 */
export type PopupAttestConfig = {
  /** Chain the registry lives on; also bound into the proof. */
  chain: SupportedChain
  /** On-chain policy id, as a 0x-prefixed 32-byte hex string. */
  policyId: `0x${string}`
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
 * `walletAddress` is the recipient account the user selected in the popup.
 */
export type PopupAttestOutcome =
  | {
      status: "minted"
      walletAddress: `0x${string}`
      txHash: `0x${string}`
      issueCall: PopupAttestIssueCall
    }
  | {
      status: "unminted"
      walletAddress: `0x${string}`
      reason?: string
      issueCall: PopupAttestIssueCall
    }
  | { status: "already-verified"; walletAddress: `0x${string}` }

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
