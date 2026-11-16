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

/**
 * A `/c` link opens the App Clip on an iPhone without the app. The clip reads chips and sends
 * any other ID to the full app, so a request keeps `/r` only when the clip could never finish
 * it: the policy accepts no chip read, the identifier is one the clip cannot make (salted or
 * none), or the phone is Android, which has no clip.
 */
export function laneFor(request: LaneRequest, os: PhoneOs): Lane {
  const acceptsChipRead = isVerificationMethodAllowed(
    VerificationMethod.ICAO_CHIP,
    request.allowedVerificationMethods,
  )
  const clipMakesIdentifier =
    request.uniqueIdentifierType !== NullifierType.SALTED &&
    request.uniqueIdentifierType !== NullifierType.NONE
  return os !== "android" && acceptsChipRead && clipMakesIdentifier ? "c" : "r"
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
