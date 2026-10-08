import type { ProofMode, ProofResult, Query, QueryResult, SupportedChain } from "@zkpassport/utils"
import type { RequestedNullifierType } from "../types"

export const DEFAULT_POPUP_URL = "https://verify.zkpassport.id"

/**
 * Credential minting request. When present, the popup ignores the free-form
 * query and instead resolves the on-chain policy from the registry, binds the
 * recipient and the chain into the proof, and once the proof is verified has
 * the user connect a wallet to submit ZKPassportCredentials.issue(). Any
 * account may pay for the mint; the credential always lands on `recipient`.
 */
export type PopupCredentialConfig = {
  /** Chain the registry lives on; also bound into the proof. */
  chain: SupportedChain
  /** On-chain policy id, as a 0x-prefixed 32-byte hex string. */
  policyId: `0x${string}`
  /** Wallet the credential is issued to, chosen by the relying party and bound into the proof. */
  recipient: `0x${string}`
}

export type PopupRequestConfig = {
  name?: string
  logo?: string
  purpose?: string
  scope?: string
  mode?: ProofMode
  devMode?: boolean
  validity?: number
  uniqueIdentifierType?: RequestedNullifierType
  oprfKeyId?: string
  policyId?: string
  domain?: string
  bridgeUrl?: string
  cloudProverUrl?: string
}

export type PopupCredentialOutcome = {
  policyId: `0x${string}`
  account: `0x${string}`
  chainId: number
  contract: `0x${string}`
  txHash?: `0x${string}`
}

/**
 * Every message names its verification, because a browser that discards the popup's tab rebuilds it
 * as a different window and the handle no longer recognises it.
 */
type Addressed<T> = T & { zkpassport: true; session?: string }

export type PopupConfigureMessage = Addressed<{
  type: "configure"
  request: PopupRequestConfig
  query: Query
  /** Mint mode; a sibling of `query` because each defines what to prove for its mode. */
  credential?: PopupCredentialConfig
}>

export type PopupReadyMessage = Addressed<{ type: "ready" }>

export type PopupEventMessage =
  | Addressed<{ type: "request-received" }>
  | Addressed<{ type: "generating" }>
  | Addressed<{ type: "proof-generated"; index?: number; total?: number; name?: string }>
  | Addressed<{
      type: "success"
      proofs: ProofResult[]
      result: QueryResult
      credential?: PopupCredentialOutcome
    }>
  | Addressed<{ type: "rejected" }>
  | Addressed<{ type: "error"; message: string }>

export type PopupMessage = PopupConfigureMessage | PopupReadyMessage | PopupEventMessage

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPopupMessage(data: any): data is PopupMessage {
  return !!data && data.zkpassport === true && typeof data.type === "string"
}
