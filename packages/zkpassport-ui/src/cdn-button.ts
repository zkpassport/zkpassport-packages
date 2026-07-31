import { mountVerifyButton } from "./button/index"
import type { VerifyWithZKPassportButtonOptions } from "./verify-button"
import { logger } from "./logger"

/**
 * Button-only CDN entry — the default for script-tag integrations:
 *
 *   <script src="https://cdn.zkpassport.id/ui/<version>/zkpassport-button.js" defer></script>
 *   <div id="verify-with-zkpassport" data-policy-id="<policy>" data-purpose="Prove you are 18+"></div>
 *
 * Contains only the "Verify with ZKPassport" button (verification runs in the
 * hosted popup) — a fraction of the size of zkpassport-ui.js, which adds the
 * embeddable QR card. The auto-mount contract is identical: elements matching
 * `#verify-with-zkpassport` or `[data-zkpassport]` are mounted on
 * DOMContentLoaded (data-zkpassport="card" is skipped here with a console hint
 * to load the full bundle), results surface as bubbling CustomEvents
 * (`zkpassport:result`, `zkpassport:rejected`, `zkpassport:error`,
 * `zkpassport:closed`), and `window.ZKPassportUI` exposes the programmatic API.
 */

const AUTO_SELECTOR = "#verify-with-zkpassport, [data-zkpassport]"
const MOUNTED_ATTR = "data-zkpassport-mounted"

function emit(element: HTMLElement, name: string, detail?: unknown) {
  element.dispatchEvent(new CustomEvent(`zkpassport:${name}`, { detail, bubbles: true }))
}

function mountFromElement(element: HTMLElement): void {
  if (element.hasAttribute(MOUNTED_ATTR)) return
  if (element.dataset.zkpassport === "card") {
    logger.error(
      'data-zkpassport="card" needs the full bundle (zkpassport-ui.js); this script only ships the button',
      element,
    )
    return
  }
  const data = element.dataset
  const policyId = data.policyId
  if (!policyId) {
    logger.error(
      "auto-mount requires data-policy-id (the query is defined by a dashboard policy); skipping",
      element,
    )
    return
  }
  element.setAttribute(MOUNTED_ATTR, "")

  const options: VerifyWithZKPassportButtonOptions = {
    domain: data.domain,
    purpose: data.purpose,
    theme: (data.theme as "light" | "dark" | "auto" | undefined) ?? "auto",
    devMode: data.devMode === "true",
    popupUrl: data.popupUrl,
    label: data.label,
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

/** Scan the document and mount every ZKPassport button not yet mounted. */
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

export { mountVerifyButton, scan }
