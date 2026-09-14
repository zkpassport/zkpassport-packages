import {
  BUTTON_FONT_SIZES,
  type VerifyButtonSize,
  type VerifyWithZKPassportButtonOptions,
} from "../verify-button"

export function readButtonOptions(
  element: HTMLElement,
  eventTarget: EventTarget,
): VerifyWithZKPassportButtonOptions | null {
  const dataAttribute = (name: string) => element.dataset[name] || undefined
  const policyId = dataAttribute("policyId")
  if (!policyId) return null

  const requestedSize = dataAttribute("size")
  const emit = (name: string, detail?: unknown) => {
    eventTarget.dispatchEvent(new CustomEvent(`zkpassport:${name}`, { detail, bubbles: true }))
  }

  return {
    policyId,
    label: dataAttribute("label") ?? (element.textContent?.trim() || undefined),
    theme: dataAttribute("theme") as VerifyWithZKPassportButtonOptions["theme"],
    size:
      requestedSize && requestedSize in BUTTON_FONT_SIZES
        ? (requestedSize as VerifyButtonSize)
        : undefined,
    devMode: element.hasAttribute("data-dev-mode"),
    popupUrl: dataAttribute("popupUrl"),
    query: (builder) => builder.done(),
    onRequestReceived: () => emit("request-received"),
    onGeneratingProof: () => emit("generating-proof"),
    onProofGenerated: (progress) => emit("proof-generated", progress),
    onSuccess: (response) => emit("success", response),
    onReject: () => emit("reject"),
    onError: (message) => emit("error", message),
    onClose: () => emit("close"),
  }
}
