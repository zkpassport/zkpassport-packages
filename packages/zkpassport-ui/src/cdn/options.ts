import {
  BUTTON_FONT_SIZES,
  type VerifyButtonSize,
  type VerifyWithZKPassportButtonOptions,
} from "../verify-button"

type ButtonTheme = NonNullable<VerifyWithZKPassportButtonOptions["theme"]>

export function readButtonOptions(element: HTMLElement): VerifyWithZKPassportButtonOptions | null {
  const attribute = (name: string) => element.dataset[name] || undefined
  const policyId = attribute("policyId")
  if (!policyId) return null

  const size = attribute("size")
  const emit = (name: string, detail?: unknown, cancelable = false) =>
    element.dispatchEvent(
      new CustomEvent(`zkpassport:${name}`, { detail, bubbles: true, cancelable }),
    )

  return {
    policyId,
    label: attribute("label"),
    theme: attribute("theme") as ButtonTheme | undefined,
    size: size && size in BUTTON_FONT_SIZES ? (size as VerifyButtonSize) : undefined,
    devMode: element.hasAttribute("data-dev-mode"),
    popupUrl: attribute("popupUrl"),
    query: (builder) => builder.done(),
    // preventDefault() on the success event shows the error state instead
    onSuccess: (response) => emit("success", response, true),
    onReject: () => emit("rejected"),
    onError: (message) => emit("error", message),
    onClose: () => emit("closed"),
  }
}
