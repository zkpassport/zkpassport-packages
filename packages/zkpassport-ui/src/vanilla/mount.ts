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
import { readRetry } from "../core/retry-bridge"
import { readService } from "../core/service-bridge"
import { safeCall } from "../core/safe-call"
import { createStateMachine, type TransitionPayload } from "../core/state"
import type { QRCardHandle, QRCardOptions, QRCardState, ZKPassportRequestLike } from "../core/types"

// Per leg — fade-out and fade-in run sequentially, so total motion is ~2× this.
const FADE_DURATION_MS = 500

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
  openAppLink: HTMLAnchorElement
  resultPanel: HTMLDivElement
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

  // Working copy of the options — `update()` reassigns after diffing.
  let current: QRCardOptions = { ...options }

  const elements = buildDom()
  element.appendChild(elements.root)

  // Bumped on each renderQr() call so a late-resolving stale Promise doesn't
  // overwrite the live QR.
  let qrToken = 0

  const machine = createStateMachine({
    // Live-read so handler changes via update() are picked up at fire time
    // without an explicit setCallbacks round-trip.
    getCallbacks: () => current,
    onTransition: renderState,
  })

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
    // Callbacks are read live by the state machine, and `theme` is unused in
    // v1, so we only diff what actually drives DOM. Header diff uses *resolved*
    // values so a request swap bringing different attached service still
    // re-renders.
    const prevHeader = resolveHeader(current)
    const nextHeader = resolveHeader(next)
    const headerChanged =
      prevHeader.name !== nextHeader.name || prevHeader.icon !== nextHeader.icon
    const requestChanged = current.request !== next.request
    if (!headerChanged && !requestChanged) return

    const prevRequest = current.request
    current = next

    if (headerChanged) renderHeader()
    if (requestChanged) handleRequestChange(prevRequest, current.request)
  }

  function resolveHeader(opts: QRCardOptions): { name: string; icon: string } {
    const attached = readService(opts.request)
    return {
      name: opts.appName ?? attached?.name ?? "",
      icon: opts.appIcon ?? attached?.logo ?? "",
    }
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
    prevRequest: ZKPassportRequestLike | null,
    nextRequest: ZKPassportRequestLike | null,
  ) {
    if (prevRequest === nextRequest) return

    if (nextRequest === null) {
      machine.detachRequest()
      clearQr()
      return
    }

    void renderQr(nextRequest)
    machine.attachRequest(nextRequest)
  }

  function handleRetryClick() {
    // Pop back to the QR step first so the user sees instant feedback while
    // the new request is being built.
    machine.retry()
    // `readRetry` triggers the hook to rebuild and emit a new request via
    // `update({ request })`. Vanilla consumers wire the rebuild themselves
    // through `onRetryClicked`.
    safeCall(readRetry(current.request))
    safeCall(current.onRetryClicked)
  }

  function renderHeader() {
    const { name, icon } = resolveHeader(current)
    // Fallback keeps the title sentence readable during the brief preparing
    // window when the hook hasn't built the request yet.
    elements.appName.textContent = name || "This app"
    if (icon) {
      elements.appIcon.src = icon
      elements.appIcon.alt = name ? `${name} icon` : ""
      elements.appIcon.style.display = ""
    } else {
      elements.appIcon.removeAttribute("src")
      elements.appIcon.style.display = "none"
    }
  }

  async function renderQr(request: ZKPassportRequestLike) {
    const myToken = ++qrToken
    elements.openAppLink.href = request.url
    try {
      const svg = await generateSvg(request.url)
      if (myToken !== qrToken || disposed) return
      elements.qrContainer.innerHTML = svg
      elements.qrLogo.innerHTML = ZKPASSPORT_LOGO || ""
      elements.qrLogo.style.display = ZKPASSPORT_LOGO ? "grid" : "none"
    } catch (cause) {
      if (myToken !== qrToken || disposed) return
      // Route through the machine so the UI transitions to `error` instead of
      // being stuck on whatever state it was in.
      machine.fail("unknown", "Failed to generate QR code", cause)
    }
  }

  function clearQr() {
    qrToken += 1
    elements.qrContainer.innerHTML = ""
    elements.qrLogo.innerHTML = ""
    elements.openAppLink.removeAttribute("href")
  }

  // Tokens guarding superseded animations: an in-flight handler checks its
  // token against the live one and bails if it's stale. Without this, a fast
  // state swap mid-transition lets the older handler clobber the newer one.
  let heightAnimToken = 0
  let fadeToken = 0

  function renderState(state: QRCardState, payload?: TransitionPayload) {
    const apply = () => applyStateContent(state, payload)
    const prevState = elements.root.getAttribute("data-state") as QRCardState | null

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply()
      return
    }

    // First paint: no crossfade, just animate height.
    if (prevState === null) {
      animateHeight(elements.root, apply)
      return
    }

    const myToken = ++fadeToken
    const prevBody = pickBody(prevState)
    const nextBody = pickBody(state)
    cancelOpacityAnimations(prevBody)
    if (nextBody !== prevBody) cancelOpacityAnimations(nextBody)

    const fadeOut = prevBody.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_DURATION_MS,
      easing: "ease",
      fill: "forwards",
    })
    fadeOut.addEventListener("finish", () => {
      if (myToken !== fadeToken || disposed) return
      animateHeight(elements.root, apply)
      nextBody.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_DURATION_MS,
        easing: "ease",
        fill: "forwards",
      })
    })
  }

  function applyStateContent(state: QRCardState, payload?: TransitionPayload) {
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
        // Skeleton is CSS-driven via [data-state="preparing"].
        break
      case "connecting":
        appendSpinner(elements.overlayBody)
        elements.overlayText.textContent = "Connecting…"
        break
      case "waiting":
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
  }

  // QR slot pre-result, result panel for success/error. They're siblings (not
  // nested) so a fade across the boundary still reads as one transition.
  function pickBody(state: QRCardState): HTMLElement {
    return state === "success" || state === "error" ? elements.resultPanel : elements.qrSlot
  }

  function cancelOpacityAnimations(el: HTMLElement) {
    for (const anim of el.getAnimations()) {
      anim.cancel()
    }
  }

  // Animate the card's bottom edge between two natural heights. Reads/writes
  // happen synchronously around `apply` so the browser doesn't paint the new
  // height before the lock takes effect. Caller handles reduced motion.
  function animateHeight(el: HTMLElement, apply: () => void, duration = 280) {
    const before = el.offsetHeight
    apply()
    const after = el.offsetHeight
    if (before === after || before === 0 || after === 0) return

    const token = ++heightAnimToken
    el.style.transition = "none"
    el.style.height = `${before}px`
    // Forced reflow: without this read, both height writes coalesce and the
    // transition has nothing to animate from.
    void el.offsetHeight
    el.style.transition = `height ${duration}ms ease`
    el.style.height = `${after}px`

    const onEnd = (event: TransitionEvent) => {
      if (event.target !== el || event.propertyName !== "height") return
      el.removeEventListener("transitionend", onEnd)
      // Newer animation already set fresh inline styles — don't clobber.
      if (token !== heightAnimToken) return
      el.style.height = ""
      el.style.transition = ""
    }
    el.addEventListener("transitionend", onEnd)
  }

  function buildDom(): CardElements {
    const root = document.createElement("div")
    root.className = "zkp-card"

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

    // Title is intentionally generic — the card reads the same across every
    // integration. `purpose` is shown to the user inside the mobile app, not here.
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

    // Shown only during `scanned` — CSS toggles visibility against the tagline.
    const approvalMessage = document.createElement("p")
    approvalMessage.className = "zkp-approval-message"
    approvalMessage.textContent = "Approve the request on your phone"

    header.append(headerIcons, title, approvalMessage)

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

    // Deep-link CTA shown only on touch devices during `waiting`. Visibility
    // is CSS-driven (`.zkp-open-app` in styles.css).
    const openAppLink = document.createElement("a")
    openAppLink.className = "zkp-open-app"
    openAppLink.textContent = "Open in ZKPassport App"

    const retry = document.createElement("button")
    retry.type = "button"
    retry.className = "zkp-retry"
    retry.textContent = "Try again"
    retry.addEventListener("click", handleRetryClick)

    // Built once; CSS swaps it in for the QR slot during `success` / `error`.
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

    const dividerTop = document.createElement("div")
    dividerTop.className = "zkp-divider zkp-divider-top"

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
    dividerBottom.className = "zkp-divider zkp-divider-bottom"

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

    root.append(header, qrSlot, openAppLink, resultPanel, dividerTop, steps, dividerBottom, footer)

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
      openAppLink,
      resultPanel,
      resultIcon,
      resultTitle,
      resultLines,
      resultActions,
      retry,
    }
  }

  return { update, unmount }
}

function buildStep(iconSvg: string, content: Node): HTMLDivElement {
  const step = document.createElement("div")
  step.className = "zkp-step"
  const icon = document.createElement("div")
  icon.className = "zkp-step-icon"
  icon.innerHTML = iconSvg
  const text = document.createElement("div")
  text.className = "zkp-step-text"
  text.appendChild(content)
  step.append(icon, text)
  return step
}

function makeStepText(linkText: string, trailingText: string, href: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  const link = document.createElement("a")
  link.href = href
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  link.textContent = linkText
  frag.append(link, document.createTextNode(` ${trailingText}`))
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

// Three concentric ring pairs, animated via CSS in styles.css. Gradient IDs
// are namespaced so they don't collide with consumer SVGs.
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
