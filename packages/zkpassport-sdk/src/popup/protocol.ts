import type { NullifierType, ProofMode, ProofResult, Query, QueryResult } from "@zkpassport/utils"
import type { QueryResultErrors } from "../types"

export const DEFAULT_POPUP_URL = "https://verify.zkpassport.id"

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
      type: "result"
      proofs: ProofResult[]
      result: QueryResult
      uniqueIdentifier: string | undefined
      uniqueIdentifierType: NullifierType | undefined
      verified: boolean
      queryResultErrors?: Partial<QueryResultErrors>
    }
  | { zkpassport: true; type: "rejected" }
  | { zkpassport: true; type: "error"; message: string }

export type PopupMessage = PopupConfigureMessage | PopupReadyMessage | PopupEventMessage

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPopupMessage(data: any): data is PopupMessage {
  return !!data && data.zkpassport === true && typeof data.type === "string"
}
