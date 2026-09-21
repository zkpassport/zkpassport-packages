import { createOfflineQuery } from "@zkpassport/sdk/query"
import {
  openVerificationPopup,
  type PopupCredentialConfig,
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

/**
 * Mints a credential onchain against a policy
 */
export type MintCredentialOptions = {
  /** Chain the credential lives on (e.g. "ethereum_sepolia"). */
  chain: SupportedChain
  /** On-chain policy id, as a 0x-prefixed hex string of at most 32 bytes. */
  onchainPolicyId: `0x${string}`
  /** Wallet the credential is issued to; bound into the proof, so it cannot change later. */
  recipient: `0x${string}`
}

type BaseVerificationOptions = PopupRequestConfig &
  PopupCallbacks & {
    popupUrl?: string
    windowMode?: "popup" | "tab"
  }

/**
 * A verification is driven either by a query (optionally narrowed by a
 * dashboard policy) or by a credential mint, whose query comes from the
 * on-chain policy. The two never combine.
 */
export type VerificationOptions =
  | (BaseVerificationOptions & {
      query: (queryBuilder: QueryBuilder) => QueryBuilderResult
      /** Dashboard policy id. */
      policyId?: string
      mintCredential?: never
    })
  | (BaseVerificationOptions & {
      mintCredential: MintCredentialOptions
      query?: never
      policyId?: never
    })

export type VerificationController = {
  readonly state: VerificationState
  verify: () => void
  /** Close the popup window. */
  close: () => void
  /**
   * Call when the button goes away. A popup that already delivered its result
   * stays open for the user; one still in progress is closed like `close()`.
   */
  dispose: () => void
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
  // Set once the popup delivered a result; from then on the window belongs to the user
  let popupFinished = false
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
    popupFinished = false
    let query: Query
    let credential: PopupCredentialConfig | undefined
    try {
      credential = toCredentialConfig(options)
      // A mint request carries no query: the popup derives it from the policy
      query = credential ? {} : buildQuery(options)
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
      credential,
      // Callbacks resolve at event time: results arrive minutes after the
      // click, and React consumers swap callbacks between renders
      callbacks: {
        onRequestReceived: () => getOptions().onRequestReceived?.(),
        onGeneratingProof: () => getOptions().onGeneratingProof?.(),
        onProofGenerated: (progress) => getOptions().onProofGenerated?.(progress),
        // Success waits for the app's onSuccess handler, which can veto it by
        // returning false (e.g. when its backend did not verify the proofs)
        onSuccess: (response) => {
          if (latestAttempt === thisAttempt) popupFinished = true
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

  const dispose = () => {
    latestAttempt++
    if (popupFinished) popupHandle?.release()
    else popupHandle?.close()
    popupHandle = null
  }

  return {
    get state() {
      return state
    },
    verify,
    close,
    dispose,
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

function toCredentialConfig(options: VerificationOptions): PopupCredentialConfig | undefined {
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
  const { chain, onchainPolicyId, recipient } = mint
  if (!chain || !onchainPolicyId || !recipient) {
    throw new Error("mintCredential requires chain, onchainPolicyId and recipient.")
  }
  // The id is a uint256 on-chain, so a caller may write it padded to 32 bytes or trimmed
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(onchainPolicyId)) {
    throw new Error(
      `onchainPolicyId must be a 0x-prefixed hex string of at most 32 bytes, got "${onchainPolicyId}".`,
    )
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    throw new Error("recipient must be a 0x-prefixed 20-byte Ethereum address.")
  }
  // Chain support is the popup's call: an unsupported chain errors there and
  // reaches this page through the protocol's error message.
  return { chain, policyId: onchainPolicyId, recipient }
}

function toPopupRequest(options: VerificationOptions): PopupRequestConfig {
  const request: Record<string, unknown> = {}
  for (const field of Object.keys(POPUP_REQUEST_FIELDS)) {
    const value = options[field as keyof PopupRequestConfig]
    if (value !== undefined) request[field] = value
  }
  return request as PopupRequestConfig
}
