import {
  APP_STORE_BADGE,
  CONFIRMATION_PHONE_IMAGE,
  GOOGLE_PLAY_BADGE,
  ICON_CHECK,
  ICON_DOWNLOAD,
  ICON_ERROR,
  ICON_GLOBE,
  ICON_SCAN,
  ICON_SHIELD,
  ZKPASSPORT_LOGO,
} from "../core/assets"
import { APP_STORE_URL, GOOGLE_PLAY_URL, ZKPASSPORT_DOWNLOAD_URL } from "../core/constants"
import { injectStyles } from "../core/inject-styles"
import { generateSvg } from "../core/qr"
import { describeVerifiedAttributes } from "../core/result-lines"
import { createStateMachine, type TransitionPayload } from "../core/state"
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
  resultIcon: HTMLDivElement
  resultTitle: HTMLHeadingElement
  resultLines: HTMLUListElement
  resultActions: HTMLDivElement
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

  // Tracks the in-flight height-animation generation so a transition that gets
  // superseded by a newer state change doesn't clear the newer transition's
  // inline styles when its own `transitionend` finally fires.
  let heightAnimToken = 0

  function renderState(state: QRCardState, payload?: TransitionPayload) {
    animateHeight(elements.root, () => {
      elements.root.setAttribute("data-state", state)
      elements.qrSlot.setAttribute("data-state", state)
      elements.overlayBody.innerHTML = ""
      elements.overlayText.textContent = ""
      elements.resultIcon.innerHTML = ""
      elements.resultTitle.textContent = ""
      elements.resultLines.innerHTML = ""
      elements.resultActions.innerHTML = ""

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
          appendConfirmationImage(elements.overlayBody)
          break
        case "generating":
          appendSpinner(elements.overlayBody)
          elements.overlayText.textContent = "Generating proof…"
          break
        case "success":
          appendCheck(elements.resultIcon)
          elements.resultTitle.textContent = "Proof Verified"
          appendResultLines(elements.resultLines, describeVerifiedAttributes(payload?.result))
          break
        case "error":
          appendErrorIcon(elements.resultIcon)
          elements.resultTitle.textContent = "Proof Verification Failed"
          appendResultLines(elements.resultLines, [
            "Some of the requested attributes could not be verified.",
          ])
          elements.resultActions.appendChild(elements.retry)
          break
      }
    })
  }

  /**
   * Animate the card's bottom edge between two natural heights.
   *
   * Synchronous flow (no paint between steps):
   *   1. read pre-change height
   *   2. run `apply` (DOM mutations — browser recomputes layout but does not paint)
   *   3. read post-change natural height
   *   4. lock the card to the pre-change height, then animate to the new one
   *
   * Honors `prefers-reduced-motion` by skipping the animation entirely.
   */
  function animateHeight(el: HTMLElement, apply: () => void, duration = 280) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply()
      return
    }

    const before = el.offsetHeight
    apply()
    const after = el.offsetHeight
    if (before === after || before === 0 || after === 0) return

    const token = ++heightAnimToken
    el.style.transition = "none"
    el.style.height = `${before}px`
    // Force the browser to commit the locked height before kicking off the
    // transition; without this read, both height writes coalesce and the
    // transition has nothing to animate from.
    void el.offsetHeight
    el.style.transition = `height ${duration}ms ease`
    el.style.height = `${after}px`

    const onEnd = (event: TransitionEvent) => {
      if (event.target !== el || event.propertyName !== "height") return
      el.removeEventListener("transitionend", onEnd)
      // A newer animation has taken over and already set fresh inline styles —
      // clearing them here would undo its lock.
      if (token !== heightAnimToken) return
      el.style.height = ""
      el.style.transition = ""
    }
    el.addEventListener("transitionend", onEnd)
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
    dots.append(
      document.createElement("span"),
      document.createElement("span"),
      document.createElement("span"),
    )
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

    // Result panel — replaces the QR slot during the `success` / `error`
    // terminal states. Built once and toggled via CSS on the card's data-state.
    const resultPanel = document.createElement("div")
    resultPanel.className = "zkp-result-panel"
    const resultIcon = document.createElement("div")
    resultIcon.className = "zkp-result-icon"
    const resultTitle = document.createElement("h2")
    resultTitle.className = "zkp-result-title"
    const resultLines = document.createElement("ul")
    resultLines.className = "zkp-result-lines"
    const resultActions = document.createElement("div")
    resultActions.className = "zkp-result-actions"
    resultPanel.append(resultIcon, resultTitle, resultLines, resultActions)

    // Steps: download, scan, approve.
    const dividerTop = document.createElement("div")
    dividerTop.className = "zkp-divider"

    const steps = document.createElement("div")
    steps.className = "zkp-steps"
    steps.append(
      buildStep(
        ICON_DOWNLOAD,
        makeStepText("Download", "the ZKPassport mobile app", ZKPASSPORT_DOWNLOAD_URL),
      ),
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

    root.append(header, qrSlot, resultPanel, dividerTop, steps, dividerBottom, footer)

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
      resultIcon,
      resultTitle,
      resultLines,
      resultActions,
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
  el.innerHTML = SPINNER_SVG
  parent.appendChild(el)
}

// Three concentric ring pairs (A/B fade against each other on opposite phase)
// driven by CSS animations declared in styles.css. Gradient IDs are namespaced
// to avoid colliding with consumer SVGs sharing the same document.
const SPINNER_SVG = `
<svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="zkp-spinner-grad-1a" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#C4A572"/>
      <stop offset="30%" stop-color="#D4B885"/>
      <stop offset="70%" stop-color="#E6CC99"/>
      <stop offset="100%" stop-color="#F0E4C7"/>
    </linearGradient>
    <linearGradient id="zkp-spinner-grad-1b" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F0E4C7"/>
      <stop offset="30%" stop-color="#E6CC99"/>
      <stop offset="70%" stop-color="#D4B885"/>
      <stop offset="100%" stop-color="#C4A572"/>
    </linearGradient>
    <linearGradient id="zkp-spinner-grad-2a" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#B8A082"/>
      <stop offset="50%" stop-color="#D4B885"/>
      <stop offset="100%" stop-color="#EDE0C8"/>
    </linearGradient>
    <linearGradient id="zkp-spinner-grad-2b" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EDE0C8"/>
      <stop offset="50%" stop-color="#D4B885"/>
      <stop offset="100%" stop-color="#B8A082"/>
    </linearGradient>
    <linearGradient id="zkp-spinner-grad-3a" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E0D4B8"/>
      <stop offset="40%" stop-color="#C4A572"/>
      <stop offset="100%" stop-color="#E0D4B8"/>
    </linearGradient>
    <linearGradient id="zkp-spinner-grad-3b" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#C4A572"/>
      <stop offset="40%" stop-color="#E0D4B8"/>
      <stop offset="100%" stop-color="#C4A572"/>
    </linearGradient>
  </defs>
  <circle class="zkp-spinner-ring-1a" cx="50" cy="50" r="30" stroke="url(#zkp-spinner-grad-1a)" stroke-width="3" stroke-linecap="round" fill="none" stroke-dasharray="50.2655 50.2655"/>
  <circle class="zkp-spinner-ring-1b" cx="50" cy="50" r="30" stroke="url(#zkp-spinner-grad-1b)" stroke-width="3" stroke-linecap="round" fill="none" stroke-dasharray="50.2655 50.2655"/>
  <circle class="zkp-spinner-ring-2a" cx="50" cy="50" r="23" stroke="url(#zkp-spinner-grad-2a)" stroke-width="2" stroke-linecap="round" fill="none" stroke-dasharray="36.1283 36.1283" stroke-dashoffset="26.1283"/>
  <circle class="zkp-spinner-ring-2b" cx="50" cy="50" r="23" stroke="url(#zkp-spinner-grad-2b)" stroke-width="2" stroke-linecap="round" fill="none" stroke-dasharray="36.1283 36.1283" stroke-dashoffset="26.1283"/>
  <circle class="zkp-spinner-ring-3a" cx="50" cy="50" r="16" stroke="url(#zkp-spinner-grad-3a)" stroke-width="1" stroke-linecap="round" fill="none" stroke-dasharray="25.1327 25.1327" stroke-dashoffset="8.1327"/>
  <circle class="zkp-spinner-ring-3b" cx="50" cy="50" r="16" stroke="url(#zkp-spinner-grad-3b)" stroke-width="1" stroke-linecap="round" fill="none" stroke-dasharray="25.1327 25.1327" stroke-dashoffset="8.1327"/>
</svg>`

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

function appendConfirmationImage(parent: HTMLElement) {
  const img = document.createElement("img")
  img.className = "zkp-confirmation-image"
  img.src = CONFIRMATION_PHONE_IMAGE
  img.alt = "Approve the request on your phone"
  parent.appendChild(img)
}

function appendResultLines(parent: HTMLUListElement, lines: ReadonlyArray<string>) {
  for (const line of lines) {
    const li = document.createElement("li")
    li.className = "zkp-result-line"
    li.textContent = line
    parent.appendChild(li)
  }
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
