// Internal entry for the hosted popup (dist/hosted*, excluded from npm). The credential
// helpers live here because they need viem, which the npm build stubs out.
export * from "./react/index"
export { injectStyles } from "./card"
export { ICON_CHECK, ICON_ZKP_MARK } from "./assets"
export { buildCredentialCardOptions, type CredentialVerifyResult } from "./credential-options"
