import type { Query } from "@zkpassport/utils"
import type { OnSuccessVerdict } from "../types"
import {
  DEFAULT_POPUP_URL,
  isPopupMessage,
  type PopupEventMessage,
  type PopupRequestConfig,
} from "./protocol"

export type PopupSuccess = Extract<PopupEventMessage, { type: "success" }>

export type PopupCallbacks = {
  onRequestReceived?: () => void
  onGeneratingProof?: () => void
  onProofGenerated?: (progress: { index?: number; total?: number; name?: string }) => void
  onSuccess?: (response: Omit<PopupSuccess, "zkpassport" | "type">) => OnSuccessVerdict
  onReject?: () => void
  onError?: (message: string) => void
  // Fired when the user closes the popup before a result was produced
  onClose?: () => void
}

export type OpenVerificationPopupOptions = {
  popupUrl?: string
  /**
   * "popup" (default) opens a small chromeless window; "tab" opens a regular
   * browser tab (or window, per the user's browser settings) with full chrome.
   */
  windowMode?: "popup" | "tab"
  request: PopupRequestConfig
  query: Query
  callbacks?: PopupCallbacks
}

export type VerificationPopupHandle = {
  close: () => void
  popup: Window
}

const POPUP_WIDTH = 460
const POPUP_HEIGHT = 780
const CLOSE_POLL_INTERVAL = 500

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
  const popupUrl = options.popupUrl ?? DEFAULT_POPUP_URL
  const popupOrigin = new URL(popupUrl).origin

  const popup =
    options.windowMode === "tab"
      ? window.open(popupUrl, "zkpassport-verify")
      : openPopupWindow(popupUrl)
  if (!popup) return null

  const callbacks = options.callbacks ?? {}
  let finished = false
  let closePoll: ReturnType<typeof setInterval> | null = null

  const cleanup = () => {
    window.removeEventListener("message", onMessage)
    if (closePoll) {
      clearInterval(closePoll)
      closePoll = null
    }
  }

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== popupOrigin) return
    if (event.source !== popup) return
    const data = event.data
    if (!isPopupMessage(data)) return
    switch (data.type) {
      case "ready":
        try {
          popup.postMessage(
            {
              zkpassport: true,
              type: "configure",
              request: options.request,
              query: options.query,
            },
            popupOrigin,
          )
        } catch (error) {
          // Most likely DataCloneError: a non-serializable value in the request options
          console.error("[zkpassport] failed to send the request to the popup:", error)
          callbacks.onError?.("Failed to send the request to the verification popup")
          try {
            popup.close()
          } catch {
            // Already closed
          }
        }
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
        const { zkpassport: _z, type: _t, ...response } = data
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
  closePoll = setInterval(() => {
    if (popup.closed) {
      cleanup()
      if (!finished) callbacks.onClose?.()
    }
  }, CLOSE_POLL_INTERVAL)

  return {
    popup,
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
