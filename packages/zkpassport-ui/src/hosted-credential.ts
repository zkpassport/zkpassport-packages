// Internal entry for the hosted popup's credential flow (dist/hosted-credential*, excluded
// from npm). Kept apart from hosted.ts because it needs viem through onchain-credentials,
// which the npm build stubs out and the popup only loads for credential requests.
export {
  buildCredentialCardOptions,
  type CredentialVerifyOptions,
  type CredentialVerifyResult,
} from "./credential-options"
