import { mount, mountVerifyButton } from "./vanilla/index"
import type { VerifyWithZKPassportButtonOptions } from "./verify-button"
import type { ZKPassportQRCodeOptions } from "./types"
import { logger } from "./logger"

/**
 * CDN (script-tag) entry. Loaded via:
 *
 *   <script src="https://cdn.zkpassport.id/ui/<version>/zkpassport-ui.js" defer></script>
 *   <div id="verify-with-zkpassport" data-policy-id="<policy>" data-purpose="Prove you are 18+"></div>
 *
 * Any element matching `#verify-with-zkpassport` or `[data-zkpassport]` is
 * auto-mounted on DOMContentLoaded. `data-zkpassport="card"` renders the embedded
 * QR card; anything else renders the "Verify with ZKPassport" button (hosted popup).
 * Because HTML attributes can't express a query builder, `data-policy-id` is
 * required: the query comes from the policy defined in the ZKPassport dashboard.
 *
 * Results are reported as DOM CustomEvents dispatched on the mounted element
 * (bubbling): `zkpassport:result`, `zkpassport:rejected`, `zkpassport:error`,
 * `zkpassport:closed`.
 *
 * The same API is available programmatically as `window.ZKPassportUI`
 * (`mount`, `mountVerifyButton`, `scan`).
 */

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
