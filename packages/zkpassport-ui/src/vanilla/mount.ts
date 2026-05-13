import { ICON_CHECK, ICON_ERROR, ICON_SCAN, ZKPASSPORT_LOGO } from "../core/assets"
import { injectStyles } from "../core/inject-styles"
import { generateSvg } from "../core/qr"
import { createStateMachine } from "../core/state"
import type { QRCardHandle, QRCardOptions, QRCardState, ZKPassportRequestLike } from "../core/types"

type ResolvedTheme = "light" | "dark"

type CardElements = {
  root: HTMLDivElement
  appIcon: HTMLImageElement
  appName: HTMLDivElement
  purpose: HTMLDivElement
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
  let current: QRCardOptions = { ...options }

  const elements = buildDom()
  element.appendChild(elements.root)

  // Theme handling. `auto` listens to `prefers-color-scheme`; explicit values skip the listener.
  let mediaQuery: MediaQueryList | null = null
  let mediaListener: ((e: MediaQueryListEvent) => void) | null = null
  applyTheme(current.theme ?? "auto")

  // Tracks the QR generation job so a stale Promise (from a request that was
  // replaced before its SVG resolved) doesn't overwrite the live QR.
  let qrToken = 0

  const machine = createStateMachine({
    callbacks: pickCallbacks(current),
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

    if (changed.includes("appName") || changed.includes("appIcon") || changed.includes("purpose")) {
      renderHeader()
    }

    if (changed.includes("theme")) {
      applyTheme(current.theme ?? "auto")
    }

    if (
      changed.includes("onReady") ||
      changed.includes("onSuccess") ||
      changed.includes("onReject") ||
      changed.includes("onError")
    ) {
      machine.setCallbacks(pickCallbacks(current))
    }

    if (changed.includes("request")) {
      handleRequestChange(prev.request, current.request)
    }
  }

  function unmount() {
    if (disposed) return
    disposed = true
    machine.dispose()
    teardownThemeListener()
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
    elements.purpose.textContent = current.purpose
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

  function applyTheme(theme: QRCardOptions["theme"]) {
    teardownThemeListener()
    if (theme === "auto" || theme === undefined) {
      // matchMedia is always present in modern browsers, but guard for jsdom
      // environments and old WebViews so we degrade to "light".
      if (typeof window.matchMedia === "function") {
        mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
        const apply = () => setResolvedTheme(mediaQuery?.matches ? "dark" : "light")
        apply()
        mediaListener = () => apply()
        mediaQuery.addEventListener("change", mediaListener)
      } else {
        setResolvedTheme("light")
      }
    } else {
      setResolvedTheme(theme)
    }
  }

  function setResolvedTheme(resolved: ResolvedTheme) {
    elements.root.setAttribute("data-theme", resolved)
  }

  function teardownThemeListener() {
    if (mediaQuery && mediaListener) {
      mediaQuery.removeEventListener("change", mediaListener)
    }
    mediaQuery = null
    mediaListener = null
  }

  function buildDom(): CardElements {
    const root = document.createElement("div")
    root.className = "zkp-card"

    const header = document.createElement("div")
    header.className = "zkp-header"
    const appIcon = document.createElement("img")
    appIcon.className = "zkp-app-icon"
    const headerText = document.createElement("div")
    headerText.className = "zkp-header-text"
    const appName = document.createElement("div")
    appName.className = "zkp-app-name"
    const purpose = document.createElement("div")
    purpose.className = "zkp-purpose"
    headerText.append(appName, purpose)
    header.append(appIcon, headerText)

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

    const footer = document.createElement("div")
    footer.className = "zkp-footer"
    const scanIcon = document.createElement("span")
    scanIcon.innerHTML = ICON_SCAN
    const footerText = document.createElement("span")
    footerText.textContent = "Scan with the ZKPassport app"
    footer.append(scanIcon, footerText)

    root.append(header, qrSlot, footer)

    return {
      root,
      appIcon,
      appName,
      purpose,
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

function pickCallbacks(o: QRCardOptions) {
  return {
    onReady: o.onReady,
    onSuccess: o.onSuccess,
    onReject: o.onReject,
    onError: o.onError,
  }
}

/**
 * Shallow diff on the option keys we actually react to. `request` is compared
 * by reference (matching React's prop semantics) so passing a new builder
 * object from `useState`/`useMemo` triggers a re-subscribe even if the URL is
 * the same. Callbacks compare by reference for the same reason.
 */
function diff(prev: QRCardOptions, next: QRCardOptions): (keyof QRCardOptions)[] {
  const keys: (keyof QRCardOptions)[] = [
    "request",
    "appName",
    "appIcon",
    "purpose",
    "theme",
    "onReady",
    "onSuccess",
    "onReject",
    "onError",
    "onRetryClicked",
  ]
  return keys.filter((k) => prev[k] !== next[k])
}
