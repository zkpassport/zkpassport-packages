import type { Query } from "@zkpassport/utils"
import type { OnSuccessVerdict } from "../types"
import {
  DEFAULT_POPUP_URL,
  isPopupMessage,
  type PopupCredentialConfig,
  type PopupEventMessage,
  type PopupRequestConfig,
} from "./protocol"

export type PopupSuccess = Extract<PopupEventMessage, { type: "success" }>

export type PopupCallbacks = {
  onRequestReceived?: () => void
  onGeneratingProof?: () => void
  onProofGenerated?: (progress: { index?: number; total?: number; name?: string }) => void
  onSuccess?: (response: Omit<PopupSuccess, "zkpassport" | "type" | "session">) => OnSuccessVerdict
  onReject?: () => void
  onError?: (message: string) => void
  // Fired when the user closes the popup before a result was produced
  onClose?: () => void
}

export type OpenVerificationPopupOptions = {
  popupUrl?: string
  // Ignored when `credential` is set: a mint always opens a tab.
  windowMode?: "popup" | "tab"
  /** Reopens the verification of this `session`, from an earlier handle, instead of starting one. */
  session?: string
  request: PopupRequestConfig
  query: Query
  credential?: PopupCredentialConfig
  callbacks?: PopupCallbacks
}

export type VerificationPopupHandle = {
  /** Close the popup window and stop listening to it. */
  close: () => void
  /** Stop listening to the popup but leave the window open for the user. */
  release: () => void
  popup: Window
  /** Names this verification to the popup. Persist it to reopen the same one later. */
  session: string
}

const POPUP_WIDTH = 460
const POPUP_HEIGHT = 780
const CLOSE_POLL_INTERVAL = 500
// A popup the browser restored can have lost `window.opener`, so it cannot announce itself. These
// blind retries reach it anyway.
const CONFIGURE_RETRY_INTERVAL = 300
const CONFIGURE_ATTEMPTS = 20

// Not randomUUID, which a plain-http dev site does not get
function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** The popup reads the session from its own URL, so it survives a reload that drops every handle. */
function withSession(popupUrl: string, session: string): string {
  const url = new URL(popupUrl)
  url.searchParams.set("s", session)
  return url.toString()
}

function openPopupWindow(popupUrl: string): Window | null {
  // Centered on the current window
  const left = Math.max(0, (window.screenX ?? 0) + (window.outerWidth - POPUP_WIDTH) / 2)
  const top = Math.max(0, (window.screenY ?? 0) + (window.outerHeight - POPUP_HEIGHT) / 2)
  return (
    window.open(
      popupUrl,
      "zkpassport-verify",
      `popup,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${Math.round(left)},top=${Math.round(top)}`,
    ) ??
    // Popup blocked: retry as a regular new tab
    window.open(popupUrl, "zkpassport-verify")
  )
}

/**
 * Open the hosted verification popup. MUST be called from a user gesture
 * (e.g. a click handler) or the browser will block the popup.
 *
 * If popup is blocked, will attempt to open in a new window.
 */
export function openVerificationPopup(
  options: OpenVerificationPopupOptions,
): VerificationPopupHandle | null {
  if (typeof window === "undefined") return null
  const session = options.session ?? newSessionId()
  const baseUrl = options.popupUrl ?? DEFAULT_POPUP_URL
  const popupUrl = withSession(baseUrl, session)
  const popupOrigin = new URL(baseUrl).origin

  const windowMode = options.credential ? "tab" : options.windowMode
  const popup =
    windowMode === "tab" ? window.open(popupUrl, "zkpassport-verify") : openPopupWindow(popupUrl)
  if (!popup) return null

  const callbacks = options.callbacks ?? {}
  let finished = false
  let closePoll: ReturnType<typeof setInterval> | null = null
  let configurePoll: ReturnType<typeof setInterval> | null = null
  let configureAttempts = 0

  const stopConfiguring = () => {
    if (!configurePoll) return
    clearInterval(configurePoll)
    configurePoll = null
  }

  const stopWatchingForClose = () => {
    if (!closePoll) return
    clearInterval(closePoll)
    closePoll = null
  }

  const cleanup = () => {
    window.removeEventListener("message", onMessage)
    stopConfiguring()
    stopWatchingForClose()
  }

  const configure = () => {
    try {
      popup.postMessage(
        {
          zkpassport: true,
          type: "configure",
          session,
          request: options.request,
          query: options.query,
          ...(options.credential ? { credential: options.credential } : {}),
        },
        popupOrigin,
      )
    } catch (error) {
      // Most likely DataCloneError: a non-serializable value in the request options
      console.error("[zkpassport] failed to send the request to the popup:", error)
      stopConfiguring()
      callbacks.onError?.("Failed to send the request to the verification popup")
      try {
        popup.close()
      } catch {
        // Already closed
      }
    }
  }

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== popupOrigin) return
    const data = event.data
    if (!isPopupMessage(data)) return
    // Older popups send no session and still have to prove themselves by their window
    const isOurs = data.session ? data.session === session : event.source === popup
    if (!isOurs) return
    // Anything at all means the popup is listening, so stop configuring it blindly
    stopConfiguring()
    switch (data.type) {
      case "ready":
        configure()
        break
      case "request-received":
        callbacks.onRequestReceived?.()
        break
      case "generating":
        callbacks.onGeneratingProof?.()
        break
      case "proof-generated":
        callbacks.onProofGenerated?.({ index: data.index, total: data.total, name: data.name })
        break
      case "success": {
        finished = true
        const { zkpassport: _z, type: _t, session: _s, ...response } = data
        callbacks.onSuccess?.(response)
        break
      }
      case "rejected":
        finished = true
        callbacks.onReject?.()
        break
      case "error":
        callbacks.onError?.(data.message)
        break
    }
  }

  window.addEventListener("message", onMessage)
  configurePoll = setInterval(() => {
    if (++configureAttempts > CONFIGURE_ATTEMPTS) stopConfiguring()
    else configure()
  }, CONFIGURE_RETRY_INTERVAL)
  closePoll = setInterval(() => {
    if (!popup.closed) return
    // A discarded tab also reports as closed and may come back, so only the watch stops here: the
    // listener stays on for a result that arrives after the window is gone
    stopWatchingForClose()
    if (!finished) callbacks.onClose?.()
  }, CLOSE_POLL_INTERVAL)

  return {
    popup,
    session,
    release: cleanup,
    close: () => {
      cleanup()
      try {
        popup.close()
      } catch {
        // Already closed
      }
    },
  }
}
