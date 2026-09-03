import { createOfflineQuery } from "@zkpassport/sdk/query"
import {
  openVerificationPopup,
  type PopupAttestConfig,
  type PopupCallbacks,
  type PopupRequestConfig,
  type VerificationPopupHandle,
} from "@zkpassport/sdk/popup"
import type { Query, QueryBuilder, QueryBuilderResult, SupportedChain } from "@zkpassport/sdk"

import { isInAppBrowser } from "./environment"
import { logger } from "./logger"

export type VerificationStatus = "idle" | "in-progress" | "success" | "error"

export type VerificationState = {
  status: VerificationStatus
  // Only set when there is a message worth showing the user
  error: string | null
}

export type VerificationOptions = Omit<PopupRequestConfig, "attest"> &
  PopupCallbacks & {
    // URL of the hosted verification page (override for local development)
    popupUrl?: string
    /** Dashboard policy id — or, with mintToken, the on-chain policy id as 0x hex. */
    policyId?: string
    /** Required unless mintToken is set (the on-chain policy defines the query). */
    query?: (queryBuilder: QueryBuilder) => QueryBuilderResult
    /**
     * Mint an attestation credential: the popup resolves policyId on the
     * registry, binds walletAddress into the proof and submits issue() when it
     * can get a signer; the result's attest outcome reports minted/unminted.
     */
    mintToken?: boolean
    /** mintToken only: chain the registry lives on (e.g. "ethereum_sepolia"). */
    chain?: SupportedChain
    /** mintToken only: credential recipient; issue() checks this binding. */
    walletAddress?: `0x${string}`
    /** mintToken only: ZKPassportAttest registry address. */
    registry?: `0x${string}`
    /** mintToken only: RPC override for dev registries. */
    rpcUrl?: string
  }

export type VerificationController = {
  readonly state: VerificationState
  verify: () => void
  close: () => void
}

// The only fields sent to the popup; anything else stays on this page.
// (attest is assembled separately in toAttestConfig, from the flat options.)
const POPUP_REQUEST_FIELDS: Record<Exclude<keyof PopupRequestConfig, "attest">, true> = {
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
      options.onError?.("Failed to build the verification query")
      return
    }

    const request = toPopupRequest(options)
    if (attest) request.attest = attest

    const handle = openVerificationPopup({
      popupUrl: options.popupUrl,
      request,
      query,
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
    throw new Error("A query callback is required unless mintToken is set.")
  }
  const builder = createOfflineQuery()
  if (options.policyId) {
    builder.policy(options.policyId)
  }
  const built = options.query(builder as never) as unknown as { query: Query }
  return built.query
}

function toAttestConfig(options: VerificationOptions): PopupAttestConfig | undefined {
  if (!options.mintToken) return undefined
  if (options.query) {
    throw new Error(
      "mintToken requests take their query from the on-chain policy; remove the query option.",
    )
  }
  const { chain, policyId, walletAddress, registry, rpcUrl } = options
  if (!chain || !policyId || !walletAddress || !registry) {
    throw new Error("mintToken requires chain, policyId, walletAddress and registry.")
  }
  if (!policyId.startsWith("0x")) {
    throw new Error("With mintToken, policyId is the on-chain policy id as 0x-prefixed hex.")
  }
  return {
    chain,
    policyId: policyId as `0x${string}`,
    walletAddress,
    registry,
    ...(rpcUrl ? { rpcUrl } : {}),
  }
}

function toPopupRequest(options: VerificationOptions): PopupRequestConfig {
  const request: Record<string, unknown> = {}
  for (const field of Object.keys(POPUP_REQUEST_FIELDS)) {
    const value = options[field as Exclude<keyof PopupRequestConfig, "attest">]
    if (value !== undefined) request[field] = value
  }
  return request as PopupRequestConfig
}
