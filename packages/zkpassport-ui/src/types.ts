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
  // The intro screen shown before the QR code: what the request verifies and
  // how it works. Set false to jump straight to the QR code.
  intro?: boolean
  // The numbered verification steps (1–5).
  steps?: boolean
  // The "ZKPassport App" footer with the App Store / Google Play download links.
  appLinks?: boolean
}

export type ZKPassportQRCodeOptions = SdkRequestProps & {
  domain?: string
  theme?: "light" | "dark" | "auto"
  display?: ZKPassportQRCodeDisplayOptions
  // "none" (default): verified is undefined, verify on your backend.
  // "api": proofs (incl. disclosed attributes) go to the verification API;
  // unreachable -> undefined, never false. Browser verified is UX-only.
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
}

// Internal, not part of the public API: set only by the hosted verify popup.
export type HostedVerificationOptions = {
  // Run real in-browser proof verification (bb.js) when the result arrives. Only
  // the hosted popup sets this: it ships the full SDK, while the published card
  // is zero-dependency and never verifies locally.
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
