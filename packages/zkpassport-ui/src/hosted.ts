// Internal entry for the hosted popup (dist/hosted*, excluded from npm). The credential
// helpers are a separate entry (hosted-credential.ts) so this one stays free of viem.
export * from "./react/index"
export { injectStyles } from "./card"
export { ICON_CHECK, ICON_ZKP_MARK } from "./assets"
export { describeQuery, type QueryDescriptionItem } from "./query-description"
export { isInAppBrowser, isMobileLike } from "./environment"
