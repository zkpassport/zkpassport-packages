import {
  openVerificationPopup,
  type PopupCredentialConfig,
  type PopupRequestConfig,
  type PopupSuccess,
  type VerificationPopupHandle,
} from "@zkpassport/sdk/popup"
import { getChainFromId, NullifierType, type ProofMode } from "@zkpassport/sdk"

import { isInAppBrowser } from "./environment"
import { ZKPassportError, type ZKPassportErrorKind } from "./errors"
import { logger } from "./logger"
import { parsePolicyId } from "./policy-id"
import { toWireQuery, type BoundData, type Query } from "./query-wire"

export type VerificationStatus = "idle" | "in-progress" | "success" | "error"

export type VerificationState = {
  status: VerificationStatus
  // Only set when there is a message worth showing the user
  error: string | null
  errorKind: ZKPassportErrorKind | null
  /**
   * This page's own URL, set when the browser can't host the verification window. The user has to
   * reopen it in a real browser, so the buttons offer it to copy or share.
   */
  openInBrowserUrl: string | null
}

/** What the service accepts, as opposed to what the query asks about the credential. */
export type ServiceConfig = {
  domain?: string
  scope?: string
  uniqueIdentifierType?: "salted" | "non-salted" | "none"
  validity?: number
  devMode?: boolean
}

/** Points the flow at your own deployment of the services ZKPassport runs. */
export type VerificationOverrides = {
  bridgeUrl?: string
  cloudProverUrl?: string
  /** @internal Points the flow at another popup origin; for testing. */
  popupUrl?: string
}

type Callbacks = {
  onSuccess?: (response: Omit<PopupSuccess, "zkpassport" | "type">) => unknown
  onError?: (error: ZKPassportError) => void
}

type BaseVerificationOptions = Callbacks & {
  purpose?: string
  service?: ServiceConfig
  bind?: BoundData
  overrides?: VerificationOverrides
}

/**
 * A verification proves a query, proves a dashboard policy, or mints the credential an on-chain
 * policy defines. An on-chain policy is only evaluated by its contract, so it always mints.
 */
export type VerificationOptions =
  | (BaseVerificationOptions & {
      query?: Query
      policyId?: string
      mode?: ProofMode
      mint?: never
    })
  | (BaseVerificationOptions & {
      mint: true
      policyId: string
      bind: BoundData & { account: `0x${string}`; chainId: number }
      query?: never
      mode?: never
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

const POPUP_BLOCKED_MESSAGE =
  "Your browser blocked the verification window. Allow pop-ups for this site, then try again."
const IN_APP_BROWSER_MESSAGE =
  "This browser can't open the verification window. Open this page in your browser to continue."

const IDENTIFIER_TYPES = {
  "salted": NullifierType.SALTED,
  "non-salted": NullifierType.NON_SALTED,
  "none": NullifierType.NONE,
} as const

// Opens the hosted popup and tracks the outcome. Shared by both buttons and the React hook.
export function createVerification(
  getOptions: () => VerificationOptions,
  onStateChange: (state: VerificationState) => void,
): VerificationController {
  let state: VerificationState = {
    status: "idle",
    error: null,
    errorKind: null,
    openInBrowserUrl: null,
  }
  let popupHandle: VerificationPopupHandle | null = null
  // Set once the popup delivered a result; from then on the window belongs to the user
  let popupFinished = false
  // Numbers each verify() so a slow onSuccess from an old popup
  // can't overwrite the status of a newer one
  let latestAttempt = 0

  const setStatus = (
    status: VerificationStatus,
    error: string | null = null,
    errorKind: ZKPassportErrorKind | null = null,
    openInBrowserUrl: string | null = null,
  ) => {
    state = { status, error, errorKind, openInBrowserUrl }
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

    // Only one terminal callback ever fires: a failure followed by the user closing the window is
    // one outcome, not two
    let settled = false
    const fail = (
      kind: ZKPassportError["kind"],
      message: string,
      { status, openInBrowserUrl }: { status?: VerificationStatus; openInBrowserUrl?: string } = {},
    ) => {
      if (settled || latestAttempt !== thisAttempt) return
      settled = true
      setStatus(
        status ?? "error",
        kind === "closed" ? null : message,
        kind,
        openInBrowserUrl ?? null,
      )
      getOptions().onError?.(new ZKPassportError(kind, message))
    }

    let request: { config: PopupRequestConfig; query: object; credential?: PopupCredentialConfig }
    try {
      request = buildRequest(options)
    } catch (reason) {
      logger.error(reason)
      const message =
        reason instanceof Error ? reason.message : "Failed to build the verification request"
      fail("failed", message)
      return
    }

    // Checked before opening, not after: an in-app browser can return a null handle and still
    // perform the navigation, leaving a dead second window on top of the message
    if (isInAppBrowser()) {
      fail("blocked", IN_APP_BROWSER_MESSAGE, { openInBrowserUrl: window.location.href })
      return
    }

    const handle = openVerificationPopup({
      popupUrl: options.overrides?.popupUrl,
      request: request.config,
      query: request.query as never,
      credential: request.credential,
      // Callbacks resolve at event time: results arrive minutes after the
      // click, and React consumers swap callbacks between renders
      callbacks: {
        // Success waits for the app's onSuccess handler, which can veto it by
        // returning false (e.g. when its backend did not verify the proofs)
        onSuccess: (response) => {
          if (latestAttempt !== thisAttempt) return
          popupFinished = true
          settled = true
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
        onReject: () => fail("rejected", "Verification was declined."),
        onError: (message) => fail("failed", message),
        // Closing without a result returns the button to idle: nothing failed, the user left
        onClose: () => fail("closed", "The verification window was closed.", { status: "idle" }),
      },
    })

    if (!handle) {
      fail("blocked", POPUP_BLOCKED_MESSAGE)
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

function buildRequest(options: VerificationOptions): {
  config: PopupRequestConfig
  query: object
  credential?: PopupCredentialConfig
} {
  const policy = options.policyId ? parsePolicyId(options.policyId) : undefined

  if (options.mint) {
    if (!policy || policy.kind !== "onchain") {
      throw new Error(
        "mint requires an on-chain policyId, for example eip155:8453:0x7b — a dashboard policy has " +
          "no contract to evaluate it.",
      )
    }
    const { account, chainId } = options.bind
    if (!/^0x[0-9a-fA-F]{40}$/.test(account)) {
      throw new Error(
        "bind.account must be a 0x-prefixed 20-byte address; it receives the credential.",
      )
    }
    // A chainless id resolves to the bound chain: the credential is minted there, so that is the
    // only chain whose copy of the policy could govern it
    if (policy.chainId !== undefined && policy.chainId !== chainId) {
      throw new Error(
        `bind.chainId (${chainId}) must match the policy's chain (${policy.chainId}).`,
      )
    }
    return {
      // No scope fallback: the evaluator checks the scope the contract stores, so the popup takes it
      // from the policy rather than from anything this page sends
      config: toPopupRequest(options),
      // A mint request carries no query: the popup derives it from the policy
      query: {},
      credential: {
        chain: getChainFromId(chainId),
        policyId: policy.policyId,
        recipient: account,
      },
    }
  }

  if (policy?.kind === "onchain") {
    throw new Error(
      `Policy "${options.policyId}" lives on-chain and can only be used with mint: true. To ` +
        "verify without minting, use a dashboard policy or a query.",
    )
  }
  if (!options.query && !policy) {
    throw new Error("A query or a policyId is required.")
  }
  if (options.query && policy) {
    throw new Error(
      "A policyId carries its own query; remove the query option or drop the policyId.",
    )
  }

  return {
    config: toPopupRequest(options, policy?.kind === "dashboard" ? policy.id : undefined),
    query: toWireQuery(options.query ?? {}, options.bind),
  }
}

function toPopupRequest(
  options: VerificationOptions,
  dashboardPolicy?: string,
): PopupRequestConfig {
  const service = options.service ?? {}
  const identifier = service.uniqueIdentifierType
  const config: PopupRequestConfig = {
    purpose: options.purpose,
    policyId: dashboardPolicy,
    domain: service.domain,
    // The identifier is scoped to the flow, so a policy is the natural default: the same person is
    // recognised across visits to it and not across a service's other flows
    scope: service.scope ?? dashboardPolicy,
    mode: options.mint ? "compressed-evm" : options.mode,
    validity: service.validity,
    devMode: service.devMode,
    bridgeUrl: options.overrides?.bridgeUrl,
    cloudProverUrl: options.overrides?.cloudProverUrl,
    // Left unset when not configured, so the SDK's own default applies
    uniqueIdentifierType: identifier ? IDENTIFIER_TYPES[identifier] : undefined,
  }
  for (const key of Object.keys(config) as Array<keyof PopupRequestConfig>) {
    if (config[key] === undefined) delete config[key]
  }
  return config
}
