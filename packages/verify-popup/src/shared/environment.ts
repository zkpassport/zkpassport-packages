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
