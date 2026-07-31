import type { QueryBuilder, QueryBuilderResult, ZKPassport } from "@zkpassport/sdk"

type SdkCallback<K extends keyof QueryBuilderResult> = QueryBuilderResult[K] extends (
  cb: infer C,
) => void
  ? C
  : never

type SdkRequestProps = Omit<
  Parameters<ZKPassport["request"]>[0],
  // skipProofVerification is owned by the card (always set): use `verification` instead
  | "projectID"
  | "topicOverride"
  | "keyPairOverride"
  | "cloudProverUrl"
  | "bridgeUrl"
  | "skipProofVerification"
>

// Toggles for optional card sections. Each defaults to shown; set false to hide.
export type ZKPassportQRCodeDisplayOptions = {
  // ZKPassport mark, app logo, and the "… uses ZKPassport …" intro line.
  header?: boolean
  // The intro screen shown before the QR code: what the request verifies, how it
  // works, and (when available) the option to verify with the saved browser ID.
  // Set false to jump straight to the QR code.
  intro?: boolean
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
  /**
   * How received proofs are checked before the card shows success and reports
   * `verified` in onResult:
   * - "none" (default): no verification in the browser. `verified` is `undefined`
   *   ("not checked"); verify the proofs on your backend.
   * - "api": the proofs and their public inputs (including disclosed attributes)
   *   are sent to the ZKPassport verification API and `verified` reflects its
   *   answer. If the API is unreachable, `verified` is `undefined`, never `false`.
   * Either way, a `verified` value observed in the browser is a UX signal only —
   * your backend must verify the proofs before trusting the result.
   */
  verification?: "none" | "api"
  /** Override the verification API base URL (self-hosted); used with verification: "api" */
  verificationApiUrl?: string
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

// Internal, not part of the public API: set only by the hosted verify popup,
// where "this origin" is the shared verify origin — which is exactly what makes
// saved IDs reusable across relying parties. Everywhere else the card is
// QR-only, so saved IDs live in a single place.
export type HostedEnrollmentOptions = {
  hostedEnrollment?: boolean
  // Run real in-browser proof verification (bb.js) when the result arrives. Only
  // the hosted popup sets this: it ships the full SDK (needed for proving anyway),
  // while the published card is zero-dependency and never verifies locally.
  hostedVerification?: boolean
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
