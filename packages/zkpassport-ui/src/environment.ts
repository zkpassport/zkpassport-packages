/**
 * Environment heuristics for adapting the verification UX:
 * - On a phone/tablet the user can't scan the QR on their own screen, so the
 *   primary action becomes opening the ZKPassport app via the request's
 *   universal link (falls through to the download page when not installed).
 * - In-app browsers (Discord, X, Instagram, …) additionally have partitioned
 *   storage and flaky window.open, so we also hint at using the real browser.
 *
 * Heuristics are best-effort by design: a wrong "mobile" guess still leaves the
 * QR reachable behind a toggle, and a wrong "desktop" guess still shows the
 * universal link once the QR screen is reached on a phone.
 */

export function isMobileLike(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  if (nav.userAgentData?.mobile) return true
  const ua = navigator.userAgent
  if (/Android|iPhone|iPod|Mobile|IEMobile/i.test(ua)) return true
  // iPadOS reports as MacIntel with touch; classic iPad token as fallback
  if (/iPad/.test(ua)) return true
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true
  return false
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  // Known in-app browser tokens
  if (
    /FBAN|FBAV|FB_IAB|Instagram|Twitter|TwitterAndroid|Discord|Snapchat|TikTok|BytedanceWebview|musical_ly|Line\/|MicroMessenger|GSA\/|LinkedInApp|Pinterest/i.test(
      ua,
    )
  ) {
    return true
  }
  // Android WebView marks itself with "; wv"
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return true
  // iOS WKWebViews lack the Safari token (real Safari, Chrome iOS and Firefox
  // iOS all include it)
  if (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua)) return true
  return false
}
