import { useMemo, useState } from "react"
import { detectMobileOs } from "@zkpassport/ui/app-link"
import type { AllowedVerificationMethod } from "@zkpassport/utils"

import { renderQrSvg } from "../request"
import { laneFor, withLane } from "./lane"

/** The request URL on the lane the policy and phone pick, and its QR code */
export function useRequestUrl(
  requestUrl: string | null,
  {
    allowedVerificationMethods,
    appClip,
  }: { allowedVerificationMethods?: AllowedVerificationMethod[]; appClip?: boolean },
) {
  const [os] = useState(detectMobileOs)
  const url = useMemo(
    () =>
      requestUrl ? withLane(requestUrl, laneFor(allowedVerificationMethods, !!appClip, os)) : null,
    [requestUrl, allowedVerificationMethods, appClip, os],
  )
  const qrSvg = useMemo(() => {
    if (!url) return null
    try {
      return renderQrSvg(url)
    } catch {
      return null
    }
  }, [url])
  return { url, qrSvg }
}
