import bundled from "./snapshot.json"
import type { Coverage } from "./types"

export const COVERAGE_URL = "https://cdn.zkpassport.id/coverage/latest.json"

/** The copy of the table shipped with this package */
export const BUNDLED_COVERAGE = bundled as Coverage

export interface LoadCoverageOptions {
  url?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export interface LoadedCoverage {
  coverage: Coverage
  source: "remote" | "bundled"
}

/**
 * The newest table available: the CDN's when it loads, is well formed and is at least as new as
 * the bundled copy, else the bundled copy.
 */
export async function loadCoverage(options: LoadCoverageOptions = {}): Promise<LoadedCoverage> {
  const { url = COVERAGE_URL, timeoutMs = 5000 } = options
  const doFetch = options.fetch ?? globalThis.fetch
  const bundledResult: LoadedCoverage = { coverage: BUNDLED_COVERAGE, source: "bundled" }
  if (!doFetch) return bundledResult

  const controller = typeof AbortController === "function" ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    const response = await doFetch(url, { signal: controller?.signal })
    if (!response.ok) return bundledResult
    const remote = await response.json()
    if (!isCoverage(remote)) return bundledResult
    if (remote.generatedAt < BUNDLED_COVERAGE.generatedAt) return bundledResult
    return { coverage: remote, source: "remote" }
  } catch {
    return bundledResult
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function isCoverage(value: unknown): value is Coverage {
  if (typeof value !== "object" || value === null) return false
  const table = value as Partial<Coverage>
  return (
    table.schemaVersion === 1 &&
    typeof table.generatedAt === "string" &&
    typeof table.countries === "object" &&
    table.countries !== null &&
    typeof table.documentTypes === "object" &&
    table.documentTypes !== null &&
    typeof table.shapes === "object" &&
    table.shapes !== null
  )
}
