import type { Query } from "@zkpassport/utils"
import {
  DEFAULT_POPUP_URL,
  isPopupMessage,
  type PopupEventMessage,
  type PopupRequestConfig,
} from "./protocol"

/** Thin RP-side client for the hosted verification popup. */

export type PopupResult = Extract<PopupEventMessage, { type: "result" }>

export type PopupCallbacks = {
  onRequestReceived?: () => void
  onGeneratingProof?: () => void
  onProofGenerated?: (progress: { index?: number; total?: number; name?: string }) => void
  onResult?: (result: Omit<PopupResult, "zkpassport" | "type">) => void
  onReject?: () => void
  onError?: (message: string) => void
  // Fired when the user closes the popup before a result was produced
  onClose?: () => void
}

export type OpenVerificationPopupOptions = {
  popupUrl?: string
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

/** Open the hosted verification popup. */
export function openVerificationPopup(
  options: OpenVerificationPopupOptions,
): VerificationPopupHandle | null {
  if (typeof window === "undefined") return null
  const popupUrl = options.popupUrl ?? DEFAULT_POPUP_URL
  const popupOrigin = new URL(popupUrl).origin

  // Centered on the current window
  const left = Math.max(0, (window.screenX ?? 0) + (window.outerWidth - POPUP_WIDTH) / 2)
  const top = Math.max(0, (window.screenY ?? 0) + (window.outerHeight - POPUP_HEIGHT) / 2)
  const popup =
    window.open(
      popupUrl,
      "zkpassport-verify",
      `popup,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${Math.round(left)},top=${Math.round(top)}`,
    ) ??
    // Popup blocked: retry as a regular new tab (same user gesture).
    window.open(popupUrl, "zkpassport-verify")
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
        popup.postMessage(
          {
            zkpassport: true,
            type: "configure",
            request: options.request,
            query: options.query,
          },
          popupOrigin,
        )
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
      case "result": {
        finished = true
        const { zkpassport: _z, type: _t, ...result } = data
        callbacks.onResult?.(result)
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
