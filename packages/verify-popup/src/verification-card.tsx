import type { Query, QueryBuilderResult } from "@zkpassport/sdk"
import { hydrateQueryBuilder, type PopupRequestConfig } from "@zkpassport/sdk/popup"
import { ZKPassportQRCode, type ZKPassportQRCodeProps } from "@zkpassport/ui/hosted"

export type VerificationConfig = {
  domain: string
  request: PopupRequestConfig
  query: Query
}

type VerificationCardProps = Pick<
  ZKPassportQRCodeProps,
  | "onRequestReceived"
  | "onGeneratingProof"
  | "onProofGenerated"
  | "onSuccess"
  | "onReject"
  | "onError"
> & {
  config: VerificationConfig
  onRequestCreated?: (sdkRequest: QueryBuilderResult) => void
}

export function VerificationCard({ config, onRequestCreated, ...events }: VerificationCardProps) {
  const { domain, request, query } = config

  // Listed one by one so the opening website cannot pass extra request options
  return (
    <ZKPassportQRCode
      domain={domain}
      name={request.name ?? domain}
      logo={request.logo}
      purpose={request.purpose}
      scope={request.scope}
      mode={request.mode}
      devMode={request.devMode}
      validity={request.validity}
      uniqueIdentifierType={request.uniqueIdentifierType}
      oprfKeyId={request.oprfKeyId}
      showIntroScreen
      query={(builder) => {
        const sdkRequest = hydrateQueryBuilder(builder, query)
        onRequestCreated?.(sdkRequest)
        return sdkRequest
      }}
      {...events}
    />
  )
}
