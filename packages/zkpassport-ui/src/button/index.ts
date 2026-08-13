import { ICON_CHECK, ICON_ZKP_MARK } from "../assets"
import buttonStyles from "../button.css"
import { injectStylesheet } from "../inject-styles"
import { createVerification, type VerificationState } from "../verification"
import {
  BUTTON_FONT_SIZES,
  buttonTooltip,
  DEFAULT_BUTTON_LABEL,
  errorMessage,
  isButtonDisabled,
  isErrorVisible,
  joinClasses,
  SUCCESS_BUTTON_LABEL,
  type VerifyWithZKPassportButtonOptions,
} from "../verify-button"

function createButtonState(className: string, icon: string) {
  const element = document.createElement("span")
  element.className = `zkp-verify-state ${className}`
  const mark = document.createElement("span")
  mark.className = "zkp-verify-button-mark"
  mark.innerHTML = icon
  const label = document.createElement("span")
  element.append(mark, label)
  return { element, label }
}

export type VerifyButtonHandle = {
  update(next: VerifyWithZKPassportButtonOptions): void
  unmount(): void
}

// Button-only entry: the hosted-popup button without the QR card (no bridge, no qrcode).
export function mountVerifyButton(
  element: HTMLElement,
  options: VerifyWithZKPassportButtonOptions,
): VerifyButtonHandle {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("@zkpassport/ui: mountVerifyButton() requires a browser environment.")
  }
  injectStylesheet(buttonStyles, "button")

  let currentOptions = options

  const root = document.createElement("div")
  const button = document.createElement("button")
  const content = document.createElement("span")
  const defaultState = createButtonState("zkp-verify-state-default", ICON_ZKP_MARK)
  const successState = createButtonState("zkp-verify-state-success", ICON_CHECK)
  const errorLine = document.createElement("p")

  button.type = "button"
  content.className = "zkp-verify-content"
  successState.label.textContent = SUCCESS_BUTTON_LABEL
  errorLine.setAttribute("role", "alert")
  content.append(defaultState.element, successState.element)
  button.append(content)
  root.append(button)

  function renderState(state: VerificationState) {
    root.className = joinClasses("zkp-verify-wrap", currentOptions.classes?.root)
    root.dataset.theme = currentOptions.theme ?? "light"
    if (currentOptions.size) {
      root.style.setProperty("--zkp-btn-font-size", BUTTON_FONT_SIZES[currentOptions.size])
    } else {
      root.style.removeProperty("--zkp-btn-font-size")
    }
    button.className = joinClasses("zkp-verify-button", currentOptions.classes?.button)
    button.dataset.status = state.status
    button.disabled = isButtonDisabled(state.status)
    button.title = buttonTooltip(state.status)
    defaultState.label.textContent = currentOptions.label ?? DEFAULT_BUTTON_LABEL

    if (isErrorVisible(state.status, currentOptions)) {
      errorLine.className = joinClasses("zkp-verify-error", currentOptions.classes?.error)
      errorLine.textContent = errorMessage(state.error)
      root.append(errorLine)
    } else {
      errorLine.remove()
    }
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
      verification.close()
      root.remove()
    },
  }
}

export {
  createVerification,
  type VerificationController,
  type VerificationOptions,
  type VerificationState,
  type VerificationStatus,
} from "../verification"
export type { VerifyButtonSize, VerifyWithZKPassportButtonOptions } from "../verify-button"

// Headless integration: wire any element to the hosted popup yourself
export {
  openVerificationPopup,
  type PopupRequestConfig,
  type PopupSuccess,
  type VerificationPopupHandle,
} from "@zkpassport/sdk/popup"
export { createOfflineQuery } from "@zkpassport/sdk/query"
