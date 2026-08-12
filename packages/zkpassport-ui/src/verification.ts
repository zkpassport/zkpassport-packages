import { createOfflineQuery } from "@zkpassport/sdk/query"
import {
  openVerificationPopup,
  type PopupCallbacks,
  type PopupRequestConfig,
  type VerificationPopupHandle,
} from "@zkpassport/sdk/popup"
import type { Query, QueryBuilder, QueryBuilderResult } from "@zkpassport/sdk"

import { isInAppBrowser } from "./environment"
import { logger } from "./logger"

export type VerificationStatus = "idle" | "in-progress" | "success" | "error"

export type VerificationState = {
  status: VerificationStatus
  // Only set when there is a message worth showing the user
  error: string | null
}

export type VerificationOptions = PopupRequestConfig &
  PopupCallbacks & {
    // URL of the hosted verification page (override for local development)
    popupUrl?: string
    policyId?: string
    query: (queryBuilder: QueryBuilder) => QueryBuilderResult
  }

export type VerificationController = {
  readonly state: VerificationState
  verify: () => void
  close: () => void
}

// The only fields sent to the popup; anything else stays on this page.
const POPUP_REQUEST_FIELDS: Record<keyof PopupRequestConfig, true> = {
  name: true,
  logo: true,
  purpose: true,
  scope: true,
  mode: true,
  devMode: true,
  validity: true,
  uniqueIdentifierType: true,
  oprfKeyId: true,
}

const POPUP_BLOCKED_MESSAGE = "Popup blocked. Allow popups for this site and try again."
const IN_APP_BROWSER_MESSAGE =
  "Couldn't open the verification window here. Open this page in Safari or Chrome and try again."

// Opens the hosted popup and tracks the outcome. Shared by both buttons and the React hook.
export function createVerification(
  getOptions: () => VerificationOptions,
  onStateChange: (state: VerificationState) => void,
): VerificationController {
  let state: VerificationState = { status: "idle", error: null }
  let popupHandle: VerificationPopupHandle | null = null

  const setStatus = (status: VerificationStatus, error: string | null = null) => {
    state = { status, error }
    onStateChange(state)
  }

  const verify = () => {
    const options = getOptions()

    if (popupHandle) {
      if (!popupHandle.popup.closed) {
        popupHandle.popup.focus()
        return
      }
      // A closed popup's handle may still hold a live close-poll; dispose it
      popupHandle.close()
      popupHandle = null
    }

    let query: Query
    try {
      query = buildQuery(options)
    } catch (reason) {
      logger.error(reason)
      setStatus("error")
      options.onError?.("Failed to build the verification query")
      return
    }

    const handle = openVerificationPopup({
      popupUrl: options.popupUrl,
      request: toPopupRequest(options),
      query,
      // Callbacks resolve at event time: results arrive minutes after the
      // click, and React consumers swap callbacks between renders
      callbacks: {
        onRequestReceived: () => getOptions().onRequestReceived?.(),
        onGeneratingProof: () => getOptions().onGeneratingProof?.(),
        onProofGenerated: (progress) => getOptions().onProofGenerated?.(progress),
        onResult: (result) => {
          setStatus(result.verified ? "success" : "error")
          getOptions().onResult?.(result)
        },
        onReject: () => {
          setStatus("error")
          getOptions().onReject?.()
        },
        onError: (message) => getOptions().onError?.(message),
        onClose: () => {
          setStatus("idle")
          getOptions().onClose?.()
        },
      },
    })

    if (!handle) {
      setStatus("error", isInAppBrowser() ? IN_APP_BROWSER_MESSAGE : POPUP_BLOCKED_MESSAGE)
      options.onError?.("Popup blocked")
      return
    }

    popupHandle = handle
    setStatus("in-progress")
  }

  const close = () => {
    popupHandle?.close()
    popupHandle = null
  }

  return {
    get state() {
      return state
    },
    verify,
    close,
  }
}

function buildQuery(options: VerificationOptions): Query {
  const builder = createOfflineQuery()
  if (options.policyId) {
    builder.policy(options.policyId)
  }
  const built = options.query(builder as never) as unknown as { query: Query }
  return built.query
}

function toPopupRequest(options: VerificationOptions): PopupRequestConfig {
  const request: Record<string, unknown> = {}
  for (const field of Object.keys(POPUP_REQUEST_FIELDS)) {
    const value = options[field as keyof PopupRequestConfig]
    if (value !== undefined) request[field] = value
  }
  return request as PopupRequestConfig
}
