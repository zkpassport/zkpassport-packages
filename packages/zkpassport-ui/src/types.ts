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
  // The verification progress steps (1–5).
  progress?: boolean
  // The "ZKPassport App" footer with the app store download links.
  instructions?: boolean
}

export type ZKPassportQRCodeOptions = SdkRequestProps & {
  domain?: string
  theme?: "light" | "dark" | "auto"
  display?: ZKPassportQRCodeDisplayOptions
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

export type QRCardHandle = {
  update(next: ZKPassportQRCodeOptions): void
  retry(): void
  unmount(): void
}
