import { useMemo, useState } from "react"
import { detectMobileOs } from "@zkpassport/ui/app-link"
import type { AllowedCredential } from "@zkpassport/utils"

import { renderQrSvg } from "../request"
import { laneFor, withLane } from "./lane"

/** The request URL on the lane the policy and phone pick, and its QR code */
export function useRequestUrl(
  requestUrl: string | null,
  { allowedCredentials, appClip }: { allowedCredentials?: AllowedCredential[]; appClip?: boolean },
) {
  const [os] = useState(detectMobileOs)
  const url = useMemo(
    () => (requestUrl ? withLane(requestUrl, laneFor(allowedCredentials, !!appClip, os)) : null),
    [requestUrl, allowedCredentials, appClip, os],
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
