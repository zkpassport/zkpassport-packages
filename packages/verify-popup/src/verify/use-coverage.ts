import { useEffect, useState } from "react"
import { BUNDLED_COVERAGE, loadCoverage, type Coverage } from "@zkpassport/utils"

let loaded: Promise<Coverage> | null = null

/** The document coverage table: the bundled copy at once, the CDN's when it has loaded */
export function useCoverage(): Coverage {
  const [coverage, setCoverage] = useState<Coverage>(BUNDLED_COVERAGE)
  useEffect(() => {
    let cancelled = false
    loaded ??= loadCoverage().then((result) => result.coverage)
    loaded.then((table) => {
      if (!cancelled) setCoverage(table)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return coverage
}
