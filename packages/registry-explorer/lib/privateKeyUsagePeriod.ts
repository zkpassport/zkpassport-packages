import { PackagedCertificate } from "@zkpassport/utils"

interface PrivateKeyUsagePeriod {
  not_before?: number
  not_after?: number
}

interface TimeRange {
  start: number
  end: number
}

interface CoverageGap {
  start: Date
  end: Date
  durationDays: number
}

interface CoverageResult {
  percentage: number
  totalDaysInPeriod: number
  coveredDays: number
  gaps: CoverageGap[]
  hasCriticalGaps: boolean // Gaps longer than 30 days
  details: {
    periods: Array<{
      certId: string
      period: PrivateKeyUsagePeriod
      startDate: Date
      endDate: Date
    }>
  }
}

/**
 * Calculate coverage percentage based on private key usage periods over the past 10 years
 * Analyzes the timeline to find any gaps where no private keys were active
 */
export function calculatePrivateKeyUsagePeriodCoverage(
  certificates: PackagedCertificate[],
  referenceDate: Date = new Date(),
  yearsToAnalyze: number = 10,
): CoverageResult {
  const endDate = Math.floor(referenceDate.getTime() / 1000)
  const startDate = endDate - yearsToAnalyze * 365.25 * 24 * 60 * 60 // 10 years ago in seconds

  // Collect all private key usage periods
  const periods: Array<{ certId: string; period: PrivateKeyUsagePeriod; range: TimeRange }> = []

  certificates.forEach((cert) => {
    if (!cert.private_key_usage_period) {
      return // Skip certificates without private key usage period
    }

    const period = cert.private_key_usage_period

    // Calculate the effective range for this certificate
    const effectiveStart = period.not_before || 0
    const effectiveEnd = period.not_after || endDate

    // Only include if the period overlaps with our analysis window
    if (effectiveEnd >= startDate && effectiveStart <= endDate) {
      periods.push({
        certId: cert.subject_key_identifier || "",
        period,
        range: {
          start: Math.max(effectiveStart, startDate),
          end: Math.min(effectiveEnd, endDate),
        },
      })
    }
  })

  // Sort periods by start time
  periods.sort((a, b) => a.range.start - b.range.start)

  // Merge overlapping periods to find coverage
  const mergedRanges: TimeRange[] = []
  periods.forEach(({ range }) => {
    if (mergedRanges.length === 0) {
      mergedRanges.push({ ...range })
    } else {
      const lastRange = mergedRanges[mergedRanges.length - 1]
      if (range.start <= lastRange.end) {
        // Overlapping or adjacent - merge them
        lastRange.end = Math.max(lastRange.end, range.end)
      } else {
        // Gap found - add new range
        mergedRanges.push({ ...range })
      }
    }
  })

  // Calculate total covered time
  let coveredSeconds = 0
  mergedRanges.forEach((range) => {
    coveredSeconds += range.end - range.start
  })

  // Find gaps
  const gaps: CoverageGap[] = []
  let currentTime = startDate

  mergedRanges.forEach((range) => {
    if (currentTime < range.start) {
      const gapDurationDays = Math.ceil((range.start - currentTime) / (24 * 60 * 60))
      gaps.push({
        start: new Date(currentTime * 1000),
        end: new Date(range.start * 1000),
        durationDays: gapDurationDays,
      })
    }
    currentTime = range.end
  })

  // Check for gap at the end
  if (currentTime < endDate) {
    const gapDurationDays = Math.ceil((endDate - currentTime) / (24 * 60 * 60))
    gaps.push({
      start: new Date(currentTime * 1000),
      end: new Date(endDate * 1000),
      durationDays: gapDurationDays,
    })
  }

  const totalSeconds = endDate - startDate
  const totalDays = Math.ceil(totalSeconds / (24 * 60 * 60))
  const coveredDays = Math.ceil(coveredSeconds / (24 * 60 * 60))
  const percentage = totalSeconds > 0 ? (coveredSeconds / totalSeconds) * 100 : 0

  return {
    percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
    totalDaysInPeriod: totalDays,
    coveredDays,
    gaps,
    hasCriticalGaps: gaps.some((gap) => gap.durationDays > 30),
    details: {
      periods: periods.map((p) => ({
        certId: p.certId,
        period: p.period,
        startDate: new Date(p.range.start * 1000),
        endDate: new Date(p.range.end * 1000),
      })),
    },
  }
}

// /**
//  * Check if a private key is currently active based on its usage period
//  */
// function isPrivateKeyActive(
//   period: PrivateKeyUsagePeriod,
//   referenceDateUnix: number
// ): boolean {
//   // If not_before is set and current date is before it, key is not yet active
//   if (period.not_before && referenceDateUnix < period.not_before) {
//     return false;
//   }

//   // If not_after is set and current date is after it, key has expired
//   if (period.not_after && referenceDateUnix > period.not_after) {
//     return false;
//   }

//   // Key is active if we're within the valid period
//   return true;
// }

/**
 * Calculate coverage for all countries based on their certificates' private key usage periods
 */
export function calculateCountryCoverage(
  certificatesByCountry: Map<string, PackagedCertificate[]>,
  referenceDate: Date = new Date(),
): Map<string, CoverageResult> {
  const coverageMap = new Map<string, CoverageResult>()

  certificatesByCountry.forEach((certificates, countryCode) => {
    const coverage = calculatePrivateKeyUsagePeriodCoverage(certificates, referenceDate)
    coverageMap.set(countryCode, coverage)
  })

  return coverageMap
}

/**
 * Get a color based on coverage percentage
 */
//These will be the blue ones in the utils
export function getCoverageColor(percentage: number): string {
  if (percentage === 0) return "#374151" // Gray for no coverage
  if (percentage < 25) return "#93C5FD" // Red for low coverage
  if (percentage < 50) return "#3B82F6" // Orange for medium-low coverage
  if (percentage < 75) return "#2563EB" // Yellow for medium-high coverage
  return "#1D4ED8" // Green for high coverage
}
