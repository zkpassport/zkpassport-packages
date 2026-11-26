import type { PopupRequestConfig } from "@zkpassport/sdk/popup"
import { NullifierType, VerificationMethod, isVerificationMethodAllowed } from "@zkpassport/utils"

/** Where the ID will be read; the popup learns it from the browser or assumes a phone that can do everything */
export type PhoneOs = "ios" | "android" | "unknown"

export type Lane = "r" | "c"

/** The parts of a request that decide its lane */
export type LaneRequest = Pick<
  PopupRequestConfig,
  "allowedVerificationMethods" | "uniqueIdentifierType"
>

export const STALLED_ATTEMPTS_BEFORE_APP_LANE = 1

/** What the popup remembers about the codes it has shown */
export type Attempts = { codeOnScreen?: boolean; stalledAttempts?: number }

/** A code is on screen */
export function codeShown(attempts: Attempts): Attempts {
  return attempts.codeOnScreen ? attempts : { ...attempts, codeOnScreen: true }
}

/**
 * The code on screen is being swapped for a new one. Asking for that counts as a stalled attempt,
 * unless the phone explained why it gave up.
 */
export function codeReplaced(attempts: Attempts, explained = false): Attempts {
  const stalled = !explained && attempts.codeOnScreen === true
  return { stalledAttempts: (attempts.stalledAttempts ?? 0) + (stalled ? 1 : 0) }
}

/**
 * A `/c` link opens the App Clip on an iPhone without the app. The clip reads chips and sends
 * any other ID to the full app, so a request keeps `/r` only when the clip could never finish
 * it: the policy accepts no chip read, the identifier is salted (the clip does not call the OPRF
 * nodes), or the phone is Android, which has no clip.
 */
export function laneFor(request: LaneRequest, os: PhoneOs, stalledAttempts = 0): Lane {
  const acceptsChipRead = isVerificationMethodAllowed(
    VerificationMethod.ICAO_CHIP,
    request.allowedVerificationMethods,
  )
  const clipMakesIdentifier = request.uniqueIdentifierType !== NullifierType.SALTED
  return os !== "android" &&
    acceptsChipRead &&
    clipMakesIdentifier &&
    stalledAttempts < STALLED_ATTEMPTS_BEFORE_APP_LANE
    ? "c"
    : "r"
}

/** The request URL on the given lane */
export function withLane(requestUrl: string, lane: Lane): string {
  const url = new URL(requestUrl)
  url.pathname = `/${lane}`
  return url.toString()
}

export function isAppClipLane(requestUrl: string | null): boolean {
  if (!requestUrl) return false
  try {
    return new URL(requestUrl).pathname === "/c"
  } catch {
    return false
  }
}

// Apple's own App Clip page counts a browser as Safari only when its user agent names exactly these
// products (the second is an iPad that asks for desktop sites). Chrome, Firefox, Edge and other iOS
// browsers add a product of their own.
const SAFARI_PRODUCTS = [
  "Mozilla AppleWebKit Version Mobile Safari",
  "Mozilla AppleWebKit Version Safari",
]

/**
 * Whether a user agent is Safari. On iOS only Safari, and the Safari view that other apps open with
 * the same user agent, show the App Clip card.
 */
export function isSafariUserAgent(userAgent: string): boolean {
  const products = userAgent
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.split("/")[0])
    .join(" ")
  return SAFARI_PRODUCTS.includes(products)
}

/** Whether a link is the page we are on (query aside): opening it would only open this page again */
export function isSamePage(url: string, here: string): boolean {
  try {
    const target = new URL(url)
    const current = new URL(here)
    return target.origin === current.origin && target.pathname === current.pathname
  } catch {
    return false
  }
}
