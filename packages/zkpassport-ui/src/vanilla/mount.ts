import {
  APP_STORE_BADGE,
  GOOGLE_PLAY_BADGE,
  ICON_CHECK,
  ICON_DOWNLOAD,
  ICON_ERROR,
  ICON_GLOBE,
  ICON_SCAN,
  ICON_SHIELD,
  ZKPASSPORT_LOGO,
} from "../core/assets"
import {
  APP_STORE_URL,
  GOOGLE_PLAY_URL,
  ZKPASSPORT_DOWNLOAD_URL,
} from "../core/constants"
import { injectStyles } from "../core/inject-styles"
import { generateSvg } from "../core/qr"
import { createStateMachine } from "../core/state"
import type { QRCardHandle, QRCardOptions, QRCardState, ZKPassportRequestLike } from "../core/types"

type CardElements = {
  root: HTMLDivElement
  appIcon: HTMLImageElement
  title: HTMLParagraphElement
  appName: HTMLElement
  qrSlot: HTMLDivElement
  qrContainer: HTMLDivElement
  qrLogo: HTMLDivElement
  overlay: HTMLDivElement
  overlayBody: HTMLDivElement
  overlayText: HTMLDivElement
  retry: HTMLButtonElement
}

/**
 * Mount the QR verification card into a host element.
 *
 * @example
 * const handle = mount(document.getElementById("zkp")!, {
 *   request: null,
 *   appName: "Your App",
 *   appIcon: "/logo.png",
 *   purpose: "Verify you're over 18",
 *   onSuccess: (r) => console.log(r),
 * })
 * // Later, once the SDK request is built:
 * handle.update({ request })
 */
export function mount(element: HTMLElement, options: QRCardOptions): QRCardHandle {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error(
      "@zkpassport/ui: mount() must be called in a browser environment (document and window required).",
    )
  }
  if (!(element instanceof HTMLElement)) {
    throw new Error("@zkpassport/ui: mount() requires an HTMLElement as the first argument.")
  }

  injectStyles()

  // Working copy of the options — `update()` mutates this in place after diffing.
  // `theme` is currently accepted but ignored (v1 is light-only); see styles.css
  // for the steps to re-enable dark mode.
  let current: QRCardOptions = { ...options }

  const elements = buildDom()
  element.appendChild(elements.root)

  // Tracks the QR generation job so a stale Promise (from a request that was
  // replaced before its SVG resolved) doesn't overwrite the live QR.
  let qrToken = 0

  const machine = createStateMachine({
    // Read live from `current` so handler changes via update() are picked up
    // at fire time without an explicit setCallbacks round-trip.
    getCallbacks: () => current,
    onTransition: renderState,
  })

  // Initial paint and event wiring.
  renderHeader()
  if (current.request !== null) {
    void renderQr(current.request)
    machine.attachRequest(current.request)
  } else {
    renderState("preparing")
  }

  let disposed = false

  function update(partial: Partial<QRCardOptions>) {
    if (disposed) return

    const next: QRCardOptions = { ...current, ...partial }
    const changed = diff(current, next)
    if (changed.length === 0) return

    const prev = current
    current = next

    if (changed.includes("appName") || changed.includes("appIcon")) {
      renderHeader()
    }

    if (changed.includes("request")) {
      handleRequestChange(prev.request, current.request)
    }
    // Callback changes are picked up automatically via the state machine's
    // getCallbacks() — no work needed here.
  }

  function unmount() {
    if (disposed) return
    disposed = true
    machine.dispose()
    elements.retry.removeEventListener("click", handleRetryClick)
    if (elements.root.parentNode) {
      elements.root.parentNode.removeChild(elements.root)
    }
  }

  function handleRequestChange(
    prev: ZKPassportRequestLike | null,
    next: ZKPassportRequestLike | null,
  ) {
    if (prev === next) return

    if (next === null) {
      machine.detachRequest()
      clearQr()
      return
    }

    void renderQr(next)
    machine.attachRequest(next)
  }

  function handleRetryClick() {
    try {
      current.onRetryClicked?.()
    } catch {
      // Consumer-thrown errors in onRetryClicked shouldn't crash the card.
    }
  }

  function renderHeader() {
    elements.appName.textContent = current.appName
    if (current.appIcon) {
      elements.appIcon.src = current.appIcon
      elements.appIcon.alt = `${current.appName} icon`
      elements.appIcon.style.display = ""
    } else {
      elements.appIcon.removeAttribute("src")
      elements.appIcon.style.display = "none"
    }
  }

  async function renderQr(request: ZKPassportRequestLike) {
    const myToken = ++qrToken
    try {
      const svg = await generateSvg(request.url)
      if (myToken !== qrToken || disposed) return
      elements.qrContainer.innerHTML = svg
      elements.qrLogo.innerHTML = ZKPASSPORT_LOGO || ""
      elements.qrLogo.style.display = ZKPASSPORT_LOGO ? "grid" : "none"
    } catch (cause) {
      if (myToken !== qrToken || disposed) return
      // Route through the state machine so the UI transitions to `error`
      // instead of being left stuck on whatever state it was in.
      machine.fail("unknown", "Failed to generate QR code", cause)
    }
  }

  function clearQr() {
    qrToken += 1
    elements.qrContainer.innerHTML = ""
    elements.qrLogo.innerHTML = ""
  }

  function renderState(state: QRCardState) {
    elements.qrSlot.setAttribute("data-state", state)
    elements.overlayBody.innerHTML = ""
    elements.overlayText.textContent = ""

    switch (state) {
      case "preparing":
        // Skeleton is purely CSS-driven via the [data-state="preparing"] selector.
        break
      case "connecting":
        appendSpinner(elements.overlayBody)
        elements.overlayText.textContent = "Connecting…"
        break
      case "waiting":
        // No overlay — the QR itself is the call to action.
        break
      case "scanned":
        elements.overlayText.textContent = "Approve the request on your phone"
        break
      case "generating":
        appendSpinner(elements.overlayBody)
        elements.overlayText.textContent = "Generating proof…"
        break
      case "success":
        appendCheck(elements.overlayBody)
        elements.overlayText.textContent = "Verified"
        break
      case "error":
        appendErrorIcon(elements.overlayBody)
        elements.overlayText.textContent = "Something went wrong"
        elements.overlayBody.appendChild(elements.retry)
        break
    }
  }

  function buildDom(): CardElements {
    const root = document.createElement("div")
    root.className = "zkp-card"

    // Header: app icon ⋯ ZKPassport globe, then a one-line tagline.
    const header = document.createElement("div")
    header.className = "zkp-header"

    const headerIcons = document.createElement("div")
    headerIcons.className = "zkp-header-icons"
    const appIcon = document.createElement("img")
    appIcon.className = "zkp-app-icon"
    const dots = document.createElement("div")
    dots.className = "zkp-header-dots"
    dots.append(document.createElement("span"), document.createElement("span"), document.createElement("span"))
    const zkpIcon = document.createElement("div")
    zkpIcon.className = "zkp-zkp-icon"
    zkpIcon.innerHTML = ICON_GLOBE
    headerIcons.append(zkpIcon, dots, appIcon)

    // Title is intentionally generic — the consumer's `purpose` prop is still
    // forwarded to `sdk.request(...)` but not shown here, so the card reads
    // the same across every integration.
    const title = document.createElement("p")
    title.className = "zkp-title"
    const appName = document.createElement("strong")
    const zkpassportStrong = document.createElement("strong")
    zkpassportStrong.textContent = "ZKPassport"
    title.append(
      appName,
      document.createTextNode(" uses "),
      zkpassportStrong,
      document.createTextNode(" to verify identity without compromising your privacy."),
    )

    header.append(headerIcons, title)

    // QR
    const qrSlot = document.createElement("div")
    qrSlot.className = "zkp-qr-slot"
    qrSlot.setAttribute("data-state", "preparing")
    const skeleton = document.createElement("div")
    skeleton.className = "zkp-skeleton"
    const qrContainer = document.createElement("div")
    qrContainer.className = "zkp-qr"
    const qrLogo = document.createElement("div")
    qrLogo.className = "zkp-qr-logo"
    qrLogo.style.display = "none"
    const overlay = document.createElement("div")
    overlay.className = "zkp-overlay"
    const overlayBody = document.createElement("div")
    overlayBody.className = "zkp-overlay-body"
    const overlayText = document.createElement("div")
    overlayText.className = "zkp-overlay-text"
    overlay.append(overlayBody, overlayText)
    qrSlot.append(skeleton, qrContainer, qrLogo, overlay)

    const retry = document.createElement("button")
    retry.type = "button"
    retry.className = "zkp-retry"
    retry.textContent = "Try again"
    retry.addEventListener("click", handleRetryClick)

    // Steps: download, scan, approve.
    const dividerTop = document.createElement("div")
    dividerTop.className = "zkp-divider"

    const steps = document.createElement("div")
    steps.className = "zkp-steps"
    steps.append(
      buildStep(ICON_DOWNLOAD, makeStepText("Download", "the ZKPassport mobile app", ZKPASSPORT_DOWNLOAD_URL)),
      buildStep(ICON_SCAN, document.createTextNode("Scan this QR code with the ZKPassport app")),
      buildStep(ICON_SHIELD, document.createTextNode("Approve the request to share your proof")),
    )

    const dividerBottom = document.createElement("div")
    dividerBottom.className = "zkp-divider"

    // Footer: label + store buttons (placeholder URLs).
    const footer = document.createElement("div")
    footer.className = "zkp-footer"
    const footerLabel = document.createElement("span")
    footerLabel.className = "zkp-footer-label"
    footerLabel.textContent = "ZKPassport App"
    const storeButtons = document.createElement("div")
    storeButtons.className = "zkp-store-buttons"
    storeButtons.append(
      buildStoreButton(APP_STORE_URL, APP_STORE_BADGE),
      buildStoreButton(GOOGLE_PLAY_URL, GOOGLE_PLAY_BADGE),
    )
    footer.append(footerLabel, storeButtons)

    root.append(header, qrSlot, dividerTop, steps, dividerBottom, footer)

    return {
      root,
      appIcon,
      title,
      appName,
      qrSlot,
      qrContainer,
      qrLogo,
      overlay,
      overlayBody,
      overlayText,
      retry,
    }
  }

  return { update, unmount }
}

function buildStep(iconSvg: string, body: Node): HTMLDivElement {
  const step = document.createElement("div")
  step.className = "zkp-step"
  const icon = document.createElement("div")
  icon.className = "zkp-step-icon"
  icon.innerHTML = iconSvg
  const text = document.createElement("div")
  text.className = "zkp-step-text"
  text.appendChild(body)
  step.append(icon, text)
  return step
}

function makeStepText(linkText: string, rest: string, href: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  const link = document.createElement("a")
  link.href = href
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  link.textContent = linkText
  frag.append(link, document.createTextNode(` ${rest}`))
  return frag
}

function buildStoreButton(
  href: string,
  badge: { ariaLabel: string; svg: string },
): HTMLAnchorElement {
  const a = document.createElement("a")
  a.className = "zkp-store-button"
  a.href = href
  a.target = "_blank"
  a.rel = "noopener noreferrer"
  a.setAttribute("aria-label", badge.ariaLabel)
  a.innerHTML = badge.svg
  return a
}

function appendSpinner(parent: HTMLElement) {
  const el = document.createElement("div")
  el.className = "zkp-spinner"
  parent.appendChild(el)
}

function appendCheck(parent: HTMLElement) {
  const el = document.createElement("div")
  el.className = "zkp-check"
  el.innerHTML = ICON_CHECK
  parent.appendChild(el)
}

function appendErrorIcon(parent: HTMLElement) {
  const el = document.createElement("div")
  el.className = "zkp-error-icon"
  el.innerHTML = ICON_ERROR
  parent.appendChild(el)
}

/**
 * Shallow diff on the option keys that actually trigger DOM/subscription work.
 * `request` is compared by reference (matching React's prop semantics) so
 * passing a new builder object from `useState`/`useMemo` triggers a
 * re-subscribe even if the URL is the same. Callback fields are intentionally
 * omitted — the state machine reads them through a getter, so a parent
 * re-render that recreates handlers does no work here.
 */
function diff(prev: QRCardOptions, next: QRCardOptions): (keyof QRCardOptions)[] {
  // `theme` is accepted on the type but ignored by the renderer in v1 (see
  // styles.css for the dark-mode re-attach plan). `purpose` is forwarded to
  // `sdk.request(...)` by the consumer but isn't rendered in the card title,
  // so changes don't need to trigger a re-render. Callbacks (`onReady` etc.)
  // are read live by the state machine, and `onRetryClicked` is read live by
  // the click handler — neither needs to trigger an update cycle.
  const keys: (keyof QRCardOptions)[] = ["request", "appName", "appIcon"]
  return keys.filter((k) => prev[k] !== next[k])
}
