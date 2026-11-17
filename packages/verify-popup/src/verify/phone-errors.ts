import type { PopupErrorCode } from "@zkpassport/sdk/popup"

type KnownError = {
  pattern: RegExp
  code: PopupErrorCode
  title: string
  message: (appName: string) => string
}

const KNOWN_ERRORS: KnownError[] = [
  {
    pattern: /^This ID is not supported yet/i,
    code: "unsupported-id",
    title: "This ID isn’t supported yet",
    message: () =>
      "ZKPassport can’t verify this ID yet. Try again with a different passport or ID card.",
  },
  {
    pattern: /does not accept the way this ID was verified/i,
    code: "id-not-accepted",
    title: "This ID can’t be used here",
    message: (appName) =>
      `${appName} doesn’t accept the way this ID was verified. Try again with a different ID.`,
  },
  {
    pattern: /does not have enough memory/i,
    code: "device-unsupported",
    title: "This phone can’t finish verification",
    message: () =>
      "Your phone doesn’t have enough memory to verify your ID. Try again on a different phone.",
  },
  {
    pattern: /^Cannot generate proof|^Sanctions check failed/i,
    code: "requirements-not-met",
    title: "Requirements not met",
    message: (appName) => `Your ID doesn’t meet what ${appName} asks for.`,
  },
]

export function describePhoneError(message: string, appName: string) {
  const known = KNOWN_ERRORS.find(({ pattern }) => pattern.test(message))
  return known ? { code: known.code, title: known.title, message: known.message(appName) } : null
}
