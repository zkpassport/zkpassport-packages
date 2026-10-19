import { APP_STORE_URL, GOOGLE_PLAY_URL } from "./assets"

export { APP_STORE_URL }

// The app rejects an install referrer whose URL is not exactly this host and path
const CANONICAL_REQUEST_URL = "https://zkpassport.id/r"

const APP_OPEN_PROBE_MS = 2500

/**
 * Sends the browser to the app through its custom scheme. The https link would unload the page and
 * take the live request with it; an unhandled custom scheme goes nowhere, so the page survives when
 * the app is missing.
 *
 * With `onOpened`, reports whether the app took over. Returns a function that stops watching.
 */
export function openRequestInApp(
  requestUrl: string,
  onOpened?: (opened: boolean) => void,
): () => void {
  const appSchemeUrl = toAppSchemeUrl(requestUrl)
  // Unreachable with a request from the SDK, which always hands over a URL
  if (!appSchemeUrl) return () => {}
  if (!onOpened) {
    window.location.href = appSchemeUrl
    return () => {}
  }
  return probeAppInstalled(appSchemeUrl, onOpened)
}

/** The request as a custom-scheme link, or null when it is not a URL. */
export function toAppSchemeUrl(requestUrl: string): string | null {
  try {
    // The third slash is required: the app reads "/r" as a path, not a host
    return `zkpassport:///r${new URL(requestUrl).search}`
  } catch {
    return null
  }
}

/**
 * Play Store link carrying the request through the install: the app reads the install referrer on
 * first launch and resumes this exact request, with no re-scan.
 */
export function playStoreUrlWithReferrer(requestUrl: string | null): string {
  if (!requestUrl) return GOOGLE_PLAY_URL
  try {
    const canonicalRequestUrl = `${CANONICAL_REQUEST_URL}${new URL(requestUrl).search}`
    const storeUrl = new URL(GOOGLE_PLAY_URL)
    // Encoded twice on purpose: the app parses the referrer itself, which undoes one layer
    storeUrl.searchParams.set(
      "referrer",
      `zkp_request_url=${encodeURIComponent(canonicalRequestUrl)}`,
    )
    return storeUrl.toString()
  } catch {
    return GOOGLE_PLAY_URL
  }
}

/** Best-effort mobile OS detection, so only the relevant store badge shows. */
export function detectMobileOs(): "ios" | "android" | "unknown" {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return "ios"
  // iPadOS can report as macOS with touch support
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return "ios"
  if (/Android/.test(ua)) return "android"
  return "unknown"
}

/**
 * Opens the app and watches for this page being hidden, which means the app took over.
 *
 * `onOpened(false)` is a hint, never a verdict: iOS Safari asks the user to confirm before
 * switching apps, so the page can still be visible at the deadline. The listeners therefore stay
 * on a while longer, and a hide in that time calls `onOpened(true)` to take the miss back.
 */
function probeAppInstalled(appSchemeUrl: string, onOpened: (opened: boolean) => void): () => void {
  let timer = 0
  let opened = false

  function stop() {
    window.clearTimeout(timer)
    document.removeEventListener("visibilitychange", onVisibilityChange)
    window.removeEventListener("pagehide", onPageHide)
  }

  function reportOpened() {
    if (opened) return
    opened = true
    stop()
    onOpened(true)
  }

  function reportMissed() {
    onOpened(false)
    // From here on, leaving the page means the user tapped a store link, not that the app opened
    timer = window.setTimeout(stop, APP_OPEN_PROBE_MS)
  }

  function onVisibilityChange() {
    if (document.visibilityState === "hidden") reportOpened()
  }

  function onPageHide() {
    reportOpened()
  }

  document.addEventListener("visibilitychange", onVisibilityChange)
  window.addEventListener("pagehide", onPageHide)
  timer = window.setTimeout(reportMissed, APP_OPEN_PROBE_MS)
  window.location.href = appSchemeUrl

  return stop
}
