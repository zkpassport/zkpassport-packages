import { ICON_CHECK, ICON_ZKP_MARK } from "../assets"
import buttonStyles from "../button.css"
import { injectStylesheet } from "../inject-styles"
import { createOpenInBrowserPanel } from "../open-in-browser-panel"
import { createVerification, type VerificationState } from "../verification"
import {
  BUTTON_CAPTION,
  buttonTooltip,
  buttonLabel,
  isButtonDisabled,
  SUCCESS_BUTTON_LABEL,
  type VerifyWithZKPassportOptions,
} from "../verify-button"

// One layer of the mark, and the label line that goes with it; the button shows
// the pair whose state matches its status
function createButtonState(state: "default" | "success", icon: string) {
  const mark = document.createElement("span")
  mark.dataset.state = state
  mark.innerHTML = icon
  const element = document.createElement("span")
  element.className = "zkp-verify-state"
  element.dataset.state = state
  const label = document.createElement("span")
  element.append(label)
  return { mark, element, label }
}

export type VerifyButtonHandle = {
  update(next: VerifyWithZKPassportOptions): void
  unmount(): void
}

// Button-only entry: the hosted-popup button without the QR card (no bridge, no qrcode).
export function mountVerifyButton(
  element: HTMLElement,
  options: VerifyWithZKPassportOptions,
): VerifyButtonHandle {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("@zkpassport/ui: mountVerifyButton() requires a browser environment.")
  }
  injectStylesheet(buttonStyles, "button")

  let currentOptions = options
  let openInBrowserPanel: HTMLElement | null = null

  const root = document.createElement("div")
  const button = document.createElement("button")
  const mark = document.createElement("span")
  const body = document.createElement("span")
  const content = document.createElement("span")
  const defaultState = createButtonState("default", ICON_ZKP_MARK)
  const successState = createButtonState("success", ICON_CHECK)
  const external = document.createElement("span")
  const caption = document.createElement("span")
  const notice = document.createElement("p")

  button.type = "button"
  mark.className = "zkp-verify-button-mark"
  body.className = "zkp-verify-body"
  content.className = "zkp-verify-content"
  successState.label.textContent = SUCCESS_BUTTON_LABEL
  external.className = "zkp-verify-external"
  external.setAttribute("aria-hidden", "true")
  // North-east arrow: the click opens the hosted ZKPassport window
  external.textContent = "\u2197"
  notice.setAttribute("role", "alert")
  caption.className = "zkp-verify-caption"
  caption.textContent = BUTTON_CAPTION
  defaultState.element.append(external)
  mark.append(defaultState.mark, successState.mark)
  content.append(defaultState.element, successState.element)
  body.append(content, caption)
  button.append(mark, body)
  root.append(button)

  function renderState(state: VerificationState) {
    const style = currentOptions.style ?? {}
    root.className = "zkp-verify-wrap"
    root.dataset.variant = style.variant ?? "filled"

    notice.remove()
    openInBrowserPanel?.remove()
    openInBrowserPanel = null
    // Only the blocked case: no window of ours can appear to carry the message
    if (state.openInBrowserUrl && state.error) {
      openInBrowserPanel = createOpenInBrowserPanel({ url: state.openInBrowserUrl })
      root.append(openInBrowserPanel)
    } else if (state.errorKind === "blocked" && state.error) {
      notice.className = "zkp-verify-notice"
      notice.textContent = state.error
      root.append(notice)
    }
    button.className = "zkp-verify-button"
    button.dataset.status = state.status
    button.disabled = isButtonDisabled(state.status)
    button.title = buttonTooltip(state.status)
    defaultState.label.textContent = buttonLabel(style.label)
  }

  const verification = createVerification(() => currentOptions, renderState)
  button.addEventListener("click", verification.verify)
  renderState(verification.state)
  element.appendChild(root)

  return {
    update(next) {
      currentOptions = next
      renderState(verification.state)
    },
    unmount() {
      verification.dispose()
      root.remove()
    },
  }
}

export {
  createVerification,
  type VerificationController,
  type ServiceConfig,
  type VerificationOverrides,
  type VerificationOptions,
  type VerificationState,
  type VerificationStatus,
} from "../verification"
export type { VerifyWithZKPassportOptions } from "../verify-button"

// Headless integration: wire any element to the hosted popup yourself
export {
  openVerificationPopup,
  type PopupRequestConfig,
  type PopupSuccess,
  type VerificationPopupHandle,
} from "@zkpassport/sdk/popup"
export { createOfflineQuery } from "@zkpassport/sdk/query"
