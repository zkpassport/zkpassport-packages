import { useMemo, useState } from "react"
import { detectMobileOs } from "@zkpassport/ui/app-link"

import { renderQrSvg } from "../request"
import { laneFor, withLane, type LaneRequest } from "./lane"

/** The request URL on the lane the request and phone pick, and its QR code */
export function useRequestUrl(
  requestUrl: string | null,
  { allowedVerificationMethods, uniqueIdentifierType }: LaneRequest,
  stalledAttempts = 0,
) {
  const [os] = useState(detectMobileOs)
  const url = useMemo(
    () =>
      requestUrl
        ? withLane(
            requestUrl,
            laneFor({ allowedVerificationMethods, uniqueIdentifierType }, os, stalledAttempts),
          )
        : null,
    [requestUrl, allowedVerificationMethods, uniqueIdentifierType, os, stalledAttempts],
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
