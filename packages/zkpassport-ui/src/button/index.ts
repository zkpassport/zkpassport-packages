import { h, render } from "preact"

import { VerifyButton, type VerifyWithZKPassportButtonOptions } from "../verify-button"

/**
 * Lightweight button-only entry: the "Verify with ZKPassport" button that opens
 * the hosted verification popup, without the embedded QR card (no bridge, no
 * qrcode). Import from "@zkpassport/ui/button" to keep the bundle minimal;
 * "@zkpassport/ui" re-exports the same function alongside the card.
 */
export function mountVerifyButton(
  element: HTMLElement,
  options: VerifyWithZKPassportButtonOptions,
): { update(next: VerifyWithZKPassportButtonOptions): void; unmount(): void } {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("@zkpassport/ui: mountVerifyButton() requires a browser environment.")
  }
  const container = document.createElement("div")
  element.appendChild(container)
  let current = options
  render(h(VerifyButton, { options: current }), container)
  return {
    update(next) {
      current = next
      render(h(VerifyButton, { options: current }), container)
    },
    unmount() {
      render(null, container)
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }
}

export type { VerifyWithZKPassportButtonOptions } from "../verify-button"

// Headless integration: wire any element to the hosted popup yourself and drive
// your own UI from the callbacks. See openVerificationPopup's documentation.
export {
  openVerificationPopup,
  type PopupRequestConfig,
  type PopupResult,
  type VerificationPopupHandle,
} from "@zkpassport/sdk/popup"
export { createOfflineQuery } from "@zkpassport/sdk/query"
