// Entry for the internal hosted-popup build only (dist/hosted*, excluded from
// npm). The credential helpers live here and NOT in the npm entries: they reach
// viem through @zkpassport/sdk, which the npm build inlines with viem stubbed
// out, while this build keeps the sdk (and its real viem) external.
export * from "./react/index"
export { injectStyles } from "./card"
export { ICON_ZKP_MARK } from "./assets"
export {
  buildCredentialCardOptions,
  type CredentialIssueCall,
  type CredentialVerifyOptions,
  type CredentialVerifyResult,
} from "./credential-options"
