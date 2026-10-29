import {
  CredentialTier,
  expandAllowedCredentials,
  getTierForCredentialScheme,
  type AllowedCredential,
} from "@zkpassport/utils"

/** Where the ID will be read; the popup learns it from the browser or assumes a phone that can do everything */
export type PhoneOs = "ios" | "android" | "unknown"

export type Lane = "r" | "c"

/** Whether every credential the policy accepts is read from a chip */
export function chipOnlyPolicy(allowedCredentials?: readonly AllowedCredential[]): boolean {
  return expandAllowedCredentials(allowedCredentials).every(
    (scheme) => getTierForCredentialScheme(scheme) === CredentialTier.GOVERNMENT_SIGNED,
  )
}

/**
 * The App Clip lane reads a chip and nothing else, so a request goes there only when its policy
 * accepts nothing but chip reads, the relying party allows the lane and the phone is not Android.
 */
export function laneFor(
  allowedCredentials: readonly AllowedCredential[] | undefined,
  appClipAllowed: boolean,
  os: PhoneOs,
): Lane {
  return appClipAllowed && os !== "android" && chipOnlyPolicy(allowedCredentials) ? "c" : "r"
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
