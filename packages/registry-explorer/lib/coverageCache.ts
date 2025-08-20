import { PackagedCertificate } from "@zkpassport/utils"
import { calculateCountryCoverage } from "./privateKeyUsagePeriod"

interface CacheEntry {
  data: ReturnType<typeof calculateCountryCoverage>
  timestamp: number
}

class CoverageCache {
  private cache: Map<string, CacheEntry> = new Map()
  private cacheDuration: number

  constructor(cacheDurationMs: number = 1000 * 60 * 60) {
    // Default 1 hour
    this.cacheDuration = cacheDurationMs
  }

  /**
   * Get cached coverage data or calculate and cache new data
   */
  async getCoverage(
    certificatesByCountry: Map<string, PackagedCertificate[]>,
    referenceDate: Date = new Date(),
  ): Promise<ReturnType<typeof calculateCountryCoverage>> {
    const cacheKey = this.getCacheKey(referenceDate)
    const cached = this.cache.get(cacheKey)

    if (cached && this.isValid(cached)) {
      return cached.data
    }

    // Calculate new coverage data
    const coverage = calculateCountryCoverage(certificatesByCountry, referenceDate)

    // Cache the result
    this.cache.set(cacheKey, {
      data: coverage,
      timestamp: Date.now(),
    })

    // Clean up old cache entries
    this.cleanupCache()

    return coverage
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Check if a cache entry is still valid
   */
  private isValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.cacheDuration
  }

  /**
   * Generate a cache key based on the reference date
   */
  private getCacheKey(referenceDate: Date): string {
    // Round to the nearest hour for cache key
    const hour = new Date(referenceDate)
    hour.setMinutes(0, 0, 0)
    return hour.toISOString()
  }

  /**
   * Remove expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheDuration) {
        this.cache.delete(key)
      }
    }
  }
}

// Export a singleton instance
export const coverageCache = new CoverageCache()

/**
 * Hook to use coverage data in React components
 */
export function useCoverageData(
  certificatesByCountry: Map<string, PackagedCertificate[]> | null,
  referenceDate: Date = new Date(),
) {
  const [coverage, setCoverage] = React.useState<ReturnType<
    typeof calculateCountryCoverage
  > | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!certificatesByCountry) {
      setLoading(false)
      return
    }

    const loadCoverage = async () => {
      setLoading(true)
      try {
        const data = await coverageCache.getCoverage(certificatesByCountry, referenceDate)
        setCoverage(data)
      } catch (error) {
        console.error("Failed to load coverage data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadCoverage()
  }, [certificatesByCountry, referenceDate])

  return { coverage, loading }
}

// Add React import for the hook
import * as React from "react"
