import type {
  NullifierType,
  ProofMode,
  ProofResult,
  Query,
  QueryResult,
  SupportedChain,
} from "@zkpassport/utils"

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
  uniqueIdentifierType?: NullifierType.NON_SALTED | NullifierType.SALTED
  oprfKeyId?: string
}

/**
 * Ready-to-send ZKPassportCredentials.issue() call, minus the ABI: pair it with
 * `ZKPassportCredentialsAbi` from `@zkpassport/onchain-credentials`.
 * The first argument is the `policyId`.
 * The second argument is the proof data.
 */
export type PopupCredentialIssueCall = {
  address: `0x${string}`
  functionName: "issue"
  args: readonly [bigint, `0x${string}`]
}

/**
 * issue() checks the wallet bound into the proof, not the transaction sender,
 * so an "unminted" issueCall may be submitted by any account the relying party
 * controls. The hosted popup emits "minted" or "already-verified" only;
 * "unminted" is reserved for a flow that hands the issue() call over instead
 * of submitting it.
 * `recipient` is the one the relying party passed in.
 */
export type PopupCredentialOutcome =
  | {
      status: "minted"
      recipient: `0x${string}`
      txHash: `0x${string}`
      issueCall: PopupCredentialIssueCall
    }
  | {
      status: "unminted"
      recipient: `0x${string}`
      reason?: string
      issueCall: PopupCredentialIssueCall
    }
  | { status: "already-verified"; recipient: `0x${string}` }

export type PopupConfigureMessage = {
  zkpassport: true
  type: "configure"
  request: PopupRequestConfig
  query: Query
  /** Mint mode; a sibling of `query` because each defines what to prove for its mode. */
  credential?: PopupCredentialConfig
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
      credential?: PopupCredentialOutcome
    }
  | { zkpassport: true; type: "rejected" }
  | { zkpassport: true; type: "error"; message: string }

export type PopupMessage = PopupConfigureMessage | PopupReadyMessage | PopupEventMessage

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPopupMessage(data: any): data is PopupMessage {
  return !!data && data.zkpassport === true && typeof data.type === "string"
}
