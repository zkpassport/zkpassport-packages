import { createOfflineQuery } from "@zkpassport/sdk/query"
import {
  openVerificationPopup,
  type PopupAttestConfig,
  type PopupCallbacks,
  type PopupRequestConfig,
  type VerificationPopupHandle,
} from "@zkpassport/sdk/popup"
import type { Query, QueryBuilder, QueryBuilderResult, SupportedChain } from "@zkpassport/sdk"

import { getAttestRegistry } from "./attest-registries"
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
    /** "popup" (default) opens a small chromeless window; "tab" a regular browser tab. */
    windowMode?: "popup" | "tab"
    /** Dashboard policy id. Not allowed with mintCredential (same as query). */
    policyId?: string
    /** Required unless mintCredential is set (the on-chain policy defines the query). */
    query?: (queryBuilder: QueryBuilder) => QueryBuilderResult
    /**
     * When present, the button mints an attestation credential instead of a
     * plain verification: the popup resolves the on-chain policy, lets the
     * user connect a wallet and pick the recipient account, binds that account
     * into the proof; the result's attest outcome reports minted/unminted and
     * the chosen account.
     */
    mintCredential?: {
      /** Chain the credential lives on (e.g. "ethereum_sepolia"). */
      chain: SupportedChain
      /** On-chain policy id, as a 0x-prefixed 32-byte hex string. */
      onchainPolicyId: `0x${string}`
    }
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
  // Numbers each verify() so a slow onSuccess from an old popup
  // can't overwrite the status of a newer one
  let latestAttempt = 0

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

    const thisAttempt = ++latestAttempt
    let query: Query
    let attest: PopupAttestConfig | undefined
    try {
      attest = toAttestConfig(options)
      // A mint request carries no query: the popup derives it from the policy
      query = attest ? {} : buildQuery(options)
    } catch (reason) {
      logger.error(reason)
      setStatus("error")
      options.onError?.(
        reason instanceof Error ? reason.message : "Failed to build the verification query",
      )
      return
    }

    const handle = openVerificationPopup({
      popupUrl: options.popupUrl,
      windowMode: options.windowMode,
      request: toPopupRequest(options),
      query,
      attest,
      // Callbacks resolve at event time: results arrive minutes after the
      // click, and React consumers swap callbacks between renders
      callbacks: {
        onRequestReceived: () => getOptions().onRequestReceived?.(),
        onGeneratingProof: () => getOptions().onGeneratingProof?.(),
        onProofGenerated: (progress) => getOptions().onProofGenerated?.(progress),
        // Success waits for the app's onSuccess handler, which can veto it by
        // returning false (e.g. when its backend did not verify the proofs)
        onSuccess: (response) => {
          const finish = (next: "success" | "error") => {
            if (latestAttempt === thisAttempt) setStatus(next)
          }
          let verdict: unknown
          try {
            verdict = getOptions().onSuccess?.(response)
          } catch (reason) {
            logger.error(reason)
            finish("error")
            return
          }
          Promise.resolve(verdict).then(
            (value) => finish(value === false ? "error" : "success"),
            (reason) => {
              logger.error(reason)
              finish("error")
            },
          )
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
    latestAttempt++
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
  if (!options.query) {
    throw new Error("A query callback is required unless mintCredential is set.")
  }
  const builder = createOfflineQuery()
  if (options.policyId) {
    builder.policy(options.policyId)
  }
  const built = options.query(builder as never) as unknown as { query: Query }
  return built.query
}

function toAttestConfig(options: VerificationOptions): PopupAttestConfig | undefined {
  const mint = options.mintCredential
  if (!mint) return undefined
  if (options.query) {
    throw new Error(
      "mintCredential requests take their query from the on-chain policy; remove the query option.",
    )
  }
  if (options.policyId) {
    throw new Error(
      "mintCredential requests take their policy from the chain; remove the policyId option.",
    )
  }
  const { chain, onchainPolicyId } = mint
  if (!chain || !onchainPolicyId) {
    throw new Error("mintCredential requires chain and onchainPolicyId.")
  }
  if (!onchainPolicyId.startsWith("0x")) {
    throw new Error("onchainPolicyId is the on-chain policy id as 0x-prefixed hex.")
  }
  return {
    chain,
    policyId: onchainPolicyId,
    registry: getAttestRegistry(chain),
  }
}

function toPopupRequest(options: VerificationOptions): PopupRequestConfig {
  const request: Record<string, unknown> = {}
  for (const field of Object.keys(POPUP_REQUEST_FIELDS)) {
    const value = options[field as keyof PopupRequestConfig]
    if (value !== undefined) request[field] = value
  }
  return request as PopupRequestConfig
}
