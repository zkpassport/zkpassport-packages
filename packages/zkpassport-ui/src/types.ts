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

export type ZKPassportQRCodeOptions = SdkRequestProps & {
  domain?: string
  theme?: "light" | "dark" | "auto"
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
