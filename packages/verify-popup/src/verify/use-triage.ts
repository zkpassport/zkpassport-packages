import { useMemo, useState } from "react"
import { detectMobileOs } from "@zkpassport/ui/app-link"
import type { AllowedCredential } from "@zkpassport/utils"

import { renderQrSvg } from "../request"
import { useCoverage } from "./use-coverage"
import {
  countries,
  EMPTY_TRIAGE,
  requestUrlFor,
  triageVerdict,
  type Triage,
  type Verdict,
} from "./triage"

/**
 * The document question on the intro, its verdict, and the request URL that carries the answer
 * on the lane the verdict picks.
 */
export function useTriage(
  requestUrl: string | null,
  { allowedCredentials, appClip }: { allowedCredentials?: AllowedCredential[]; appClip?: boolean },
) {
  const coverage = useCoverage()
  const [triage, setTriage] = useState<Triage>(EMPTY_TRIAGE)
  const [os] = useState(detectMobileOs)
  const verdict: Verdict = useMemo(
    () => triageVerdict(coverage, triage, allowedCredentials, os),
    [coverage, triage, allowedCredentials, os],
  )
  const url = useMemo(
    () =>
      requestUrl
        ? requestUrlFor(requestUrl, triage, verdict, { appClipAllowed: !!appClip, os })
        : null,
    [requestUrl, triage, verdict, appClip, os],
  )
  const qrSvg = useMemo(() => {
    if (!url) return null
    try {
      return renderQrSvg(url)
    } catch {
      return null
    }
  }, [url])

  return { countries: countries(coverage), triage, setTriage, verdict, url, qrSvg }
}
