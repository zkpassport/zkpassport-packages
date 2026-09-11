import {
  BUTTON_FONT_SIZES,
  type VerifyButtonSize,
  type VerifyWithZKPassportButtonOptions,
} from "../verify-button"

export function readButtonOptions(
  element: HTMLElement,
  eventTarget: EventTarget = element,
): VerifyWithZKPassportButtonOptions | null {
  const dataAttribute = (name: string) => element.dataset[name] || undefined
  const link = element.tagName === "A" ? (element as HTMLAnchorElement) : undefined
  const linkUrl = link?.href ? new URL(link.href) : undefined
  const policyId = dataAttribute("policyId") ?? linkUrl?.searchParams.get("policy")
  if (!policyId) return null

  const size = dataAttribute("size")
  const emit = (name: string, init: CustomEventInit = {}) =>
    eventTarget.dispatchEvent(new CustomEvent(`zkpassport:${name}`, { bubbles: true, ...init }))

  return {
    policyId,
    label: dataAttribute("label") ?? (link?.textContent?.trim() || undefined),
    theme: dataAttribute("theme") as VerifyWithZKPassportButtonOptions["theme"],
    size: size && size in BUTTON_FONT_SIZES ? (size as VerifyButtonSize) : undefined,
    devMode: element.hasAttribute("data-dev-mode"),
    popupUrl: dataAttribute("popupUrl") ?? linkUrl?.href,
    query: (builder) => builder.done(),
    // preventDefault() on the success event shows the error state instead
    onSuccess: (response) => emit("success", { detail: response, cancelable: true }),
    onReject: () => emit("rejected"),
    onError: (message) => emit("error", { detail: message }),
    onClose: () => emit("closed"),
  }
}
