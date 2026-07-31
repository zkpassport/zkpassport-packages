import type { NullifierType, ProofMode, ProofResult, Query, QueryResult } from "@zkpassport/utils"
import type { QueryResultErrors } from "../types"

/**
 * postMessage protocol between an RP page (opener) and the hosted verification
 * popup on the zkpassport verify origin.
 *
 * Security model: the popup derives the RP's identity EXCLUSIVELY from the
 * `configure` message's `event.origin` (browser-attested). The payload never
 * carries a self-declared domain.
 */

export const DEFAULT_POPUP_URL = "https://verify.zkpassport.id"

/** Serializable request options forwarded to the popup (no functions). */
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
  enableBrowserEnrollment?: boolean
}

export type PopupConfigureMessage = {
  zkpassport: true
  type: "configure"
  request: PopupRequestConfig
  // The final query object (structured-clone safe, Dates preserved)
  query: Query
  // When set, the popup applies the policy instead of the raw query
  policyId?: string
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
      type: "result"
      proofs: ProofResult[]
      result: QueryResult
      uniqueIdentifier: string | undefined
      uniqueIdentifierType: NullifierType | undefined
      // The popup verifies proofs in place with the full SDK; `undefined` means it
      // could not run the verification (e.g. the backend failed to load). Either
      // way this is a UX signal — the RP backend must verify the proofs itself.
      verified: boolean | undefined
      queryResultErrors?: Partial<QueryResultErrors>
    }
  | { zkpassport: true; type: "rejected" }
  | { zkpassport: true; type: "error"; message: string }
  | { zkpassport: true; type: "enrollment-saved" }
  | { zkpassport: true; type: "enrollment-declined" }

export type PopupMessage = PopupConfigureMessage | PopupReadyMessage | PopupEventMessage

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPopupMessage(data: any): data is PopupMessage {
  return !!data && data.zkpassport === true && typeof data.type === "string"
}
