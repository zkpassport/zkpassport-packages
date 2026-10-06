import { detectMobileOs } from "./app-link"

const COPIED_RESET_MS = 2000

// Most desktop browsers have no share sheet, and an inert button is worse than none
function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
}

function openInBrowserHint(): string {
  const os = detectMobileOs()
  if (os === "ios") return "Or open this app’s menu and choose “Open in Safari”."
  if (os === "android") return "Or open this app’s menu and choose “Open in Chrome”."
  return "Or open this app’s menu and choose to open the page in your browser."
}

/** The page's own address, ready for the user to carry into a browser that can host the window. */
export function createOpenInBrowserPanel({
  message,
  url,
}: {
  message: string
  url: string
}): HTMLElement {
  const panel = document.createElement("div")
  const lead = document.createElement("p")
  const field = document.createElement("input")
  const actions = document.createElement("div")
  const copyButton = document.createElement("button")
  const hint = document.createElement("p")

  panel.className = "zkp-escape"
  panel.setAttribute("role", "alert")
  lead.className = "zkp-escape-message"
  lead.textContent = message
  field.className = "zkp-escape-url"
  field.readOnly = true
  field.value = url
  field.setAttribute("aria-label", "Page address")
  field.addEventListener("focus", () => field.select())
  actions.className = "zkp-escape-actions"
  copyButton.type = "button"
  copyButton.className = "zkp-escape-action"
  copyButton.textContent = "Copy link"
  hint.className = "zkp-escape-hint"
  hint.textContent = openInBrowserHint()

  let copiedResetTimer = 0
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url)
      copyButton.textContent = "Link copied"
      window.clearTimeout(copiedResetTimer)
      copiedResetTimer = window.setTimeout(() => {
        copyButton.textContent = "Copy link"
      }, COPIED_RESET_MS)
    } catch {
      // Some embedded browsers deny clipboard access; select the link rather than look broken
      field.select()
      copyButton.textContent = "Copy the selected link"
    }
  })
  actions.append(copyButton)

  if (canShare()) {
    const shareButton = document.createElement("button")
    shareButton.type = "button"
    shareButton.className = "zkp-escape-action"
    shareButton.textContent = "Share"
    shareButton.addEventListener("click", () => {
      // A dismissed share sheet rejects too, so there is nothing to report
      navigator.share({ url, title: "Verify with ZKPassport" }).catch(() => undefined)
    })
    actions.append(shareButton)
  }

  panel.append(lead, field, actions, hint)
  return panel
}
