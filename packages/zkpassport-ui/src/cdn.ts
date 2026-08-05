import { mount, mountVerifyButton } from "./vanilla/index"
import type { VerifyWithZKPassportButtonOptions } from "./verify-button"
import type { ZKPassportQRCodeOptions } from "./types"
import { logger } from "./logger"

// CDN (script-tag) entry: exposes window.ZKPassportUI and auto-mounts
// #verify-with-zkpassport / [data-zkpassport] elements on DOMContentLoaded.
// data-policy-id is required (HTML can't express a query builder); results
// surface as bubbling zkpassport:* CustomEvents on the mounted element.

const AUTO_SELECTOR = "#verify-with-zkpassport, [data-zkpassport]"
const MOUNTED_ATTR = "data-zkpassport-mounted"

function emit(element: HTMLElement, name: string, detail?: unknown) {
  element.dispatchEvent(new CustomEvent(`zkpassport:${name}`, { detail, bubbles: true }))
}

function readCommonOptions(element: HTMLElement) {
  const data = element.dataset
  return {
    policyId: data.policyId,
    domain: data.domain,
    purpose: data.purpose,
    theme: (data.theme as "light" | "dark" | "auto" | undefined) ?? "auto",
    devMode: data.devMode === "true",
    popupUrl: data.popupUrl,
    label: data.label,
  }
}

function mountFromElement(element: HTMLElement): void {
  if (element.hasAttribute(MOUNTED_ATTR)) return
  const { policyId, domain, purpose, theme, devMode, popupUrl, label } = readCommonOptions(element)

  if (!policyId) {
    logger.error(
      "auto-mount requires data-policy-id (the query is defined by a dashboard policy); skipping",
      element,
    )
    return
  }
  element.setAttribute(MOUNTED_ATTR, "")

  if (element.dataset.zkpassport === "card") {
    const options: ZKPassportQRCodeOptions = {
      domain,
      purpose,
      theme,
      devMode,
      query: (q) => q.policy(policyId).done(),
      onResult: (response) => emit(element, "result", response),
      onReject: () => emit(element, "rejected"),
      onError: (error) => emit(element, "error", error),
    }
    mount(element, options)
    return
  }

  const options: VerifyWithZKPassportButtonOptions = {
    domain,
    purpose,
    theme,
    devMode,
    popupUrl,
    label,
    policyId,
    // The popup rebuilds the query from the policy (see hydrateQueryBuilder);
    // the local query only satisfies the serialization step
    query: (q) => q.done(),
    onResult: (result) => emit(element, "result", result),
    onReject: () => emit(element, "rejected"),
    onError: (message) => emit(element, "error", message),
    onClose: () => emit(element, "closed"),
  }
  mountVerifyButton(element, options)
}

/** Scan the document and mount every ZKPassport element not yet mounted. */
function scan(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(AUTO_SELECTOR).forEach((element) => {
    try {
      mountFromElement(element)
    } catch (reason) {
      logger.error(reason)
    }
  })
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan())
  } else {
    scan()
  }
}

export { mount, mountVerifyButton, scan }
