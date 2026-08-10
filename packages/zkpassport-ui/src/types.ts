import type { QueryBuilder, QueryBuilderResult, ZKPassport } from "@zkpassport/sdk"

type SdkCallback<K extends keyof QueryBuilderResult> = QueryBuilderResult[K] extends (
  cb: infer C,
) => void
  ? C
  : never

type SdkRequestProps = Omit<
  Parameters<ZKPassport["request"]>[0],
  "projectID" | "topicOverride" | "keyPairOverride" | "cloudProverUrl" | "bridgeUrl"
>

// Toggles for optional card sections. Each defaults to shown; set false to hide.
export type ZKPassportQRCodeDisplayOptions = {
  // ZKPassport mark, app logo, and the "… uses ZKPassport …" intro line.
  header?: boolean
  // The numbered verification steps (1–5).
  steps?: boolean
  // The "ZKPassport App" footer with the App Store / Google Play download links.
  appLinks?: boolean
  // Browser verification elements: the "Verify with this browser" option, the
  // "Remember in this browser" checkbox and the post-verification save prompt
  // (only shown when enableBrowserEnrollment is set on the request).
  browserVerification?: boolean
}

export type ZKPassportQRCodeOptions = SdkRequestProps & {
  domain?: string
  theme?: "light" | "dark" | "auto"
  display?: ZKPassportQRCodeDisplayOptions
  showIntroScreen?: boolean
  query: (queryBuilder: QueryBuilder) => QueryBuilderResult
  onReady?: () => void
  onRetryClicked?: () => void
  onBridgeConnect?: SdkCallback<"onBridgeConnect">
  onRequestReceived?: SdkCallback<"onRequestReceived">
  onGeneratingProof?: SdkCallback<"onGeneratingProof">
  onProofGenerated?: SdkCallback<"onProofGenerated">
  onResult?: SdkCallback<"onResult">
  onReject?: SdkCallback<"onReject">
  onError?: SdkCallback<"onError">
  // Browser enrollment (requires enableBrowserEnrollment: true)
  // Called when the post-verification save prompt is shown to the user.
  onEnrollmentOffered?: () => void
  // Called when the user saved the enrollment to this browser after verification.
  onEnrollmentSaved?: () => void
  // Called when the user declined to save the enrollment (or saving failed).
  onEnrollmentDeclined?: () => void
  // Called when local (in-browser) verification starts.
  onLocalVerificationStart?: () => void
  // Called when local verification failed and the card fell back to the QR flow.
  onLocalVerificationFallback?: (reason: string) => void
}

// Internal: set only by the hosted verify popup, whose shared origin is what makes saved IDs reusable
export type HostedEnrollmentOptions = {
  hostedEnrollment?: boolean
}

export type QRCardHandle = {
  update(next: ZKPassportQRCodeOptions): void
  retry(): void
  unmount(): void
}

// Re-export essential types
export {
  ZKPassport,
  NullifierType,
  ProofType,
  ProofTypeLength,
  SANCTIONED_COUNTRIES,
  EU_COUNTRIES,
  EEA_COUNTRIES,
  SCHENGEN_COUNTRIES,
  ASEAN_COUNTRIES,
  MERCOSUR_COUNTRIES,
} from "@zkpassport/sdk"

export type {
  QueryBuilder,
  QueryBuilderResult,
  ProofResult,
  QueryResult,
  QueryResultError,
  QueryResultErrors,
  Query,
  IDCredential,
  DisclosableIDCredential,
  IDCredentialValue,
  NumericalIDCredential,
  CountryName,
  FacematchMode,
  SanctionsCountries,
  SanctionsLists,
  SupportedChain,
  ProofMode,
  BoundData,
  Service,
} from "@zkpassport/sdk"
