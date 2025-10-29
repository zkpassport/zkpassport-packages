import { PackagedCertificate } from "@zkpassport/utils"

export interface PrivateKeyUsagePeriod {
  not_before?: number
  not_after?: number
}

export interface TimeRange {
  start: number
  end: number
}

export interface CoverageGap {
  start: Date
  end: Date
  durationDays: number
}

export interface PeriodDetail {
  certId: string
  period: PrivateKeyUsagePeriod
  startDate: Date
  endDate: Date
}

export interface CoverageResult {
  percentage: number
  totalDaysInPeriod: number
  coveredDays: number
  gaps: CoverageGap[]
  hasGaps: boolean // Gaps longer than 30 days
  hasPrivateKeyData: boolean // Whether any certificates have private key usage periods
  certificatesWithoutPeriods: number // Count of certificates missing this data
  details: {
    actualPeriods: PeriodDetail[]
    estimatedPeriods: PeriodDetail[]
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
  includeEstimated: boolean = true,
): CoverageResult {
  const endDate = Math.floor(referenceDate.getTime() / 1000)
  const startDate = endDate - yearsToAnalyze * 365.25 * 24 * 60 * 60 // 10 years ago in seconds

  // Collect actual and estimated private key usage periods separately
  const actualPeriods: Array<{ certId: string; period: PrivateKeyUsagePeriod; range: TimeRange }> =
    []
  const estimatedPeriods: Array<{
    certId: string
    period: PrivateKeyUsagePeriod
    range: TimeRange
  }> = []
  let certificatesWithoutPeriods = 0

  certificates.forEach((cert) => {
    if (!cert.private_key_usage_period) {
      certificatesWithoutPeriods++

      // Add estimated period if includeEstimated is true
      if (includeEstimated) {
        // Estimate private key validity as 4 years (middle of 3-5 year range)
        const estimatedDuration = 4 * 365 * 24 * 60 * 60 // 4 years in seconds
        const certStart = cert.validity.not_before
        const certEnd = cert.validity.not_after

        // Private key typically starts with certificate and lasts 4 years
        const pkEnd = Math.min(certStart + estimatedDuration, certEnd)

        const estimatedPeriod: PrivateKeyUsagePeriod = {
          not_before: certStart,
          not_after: pkEnd,
        }

        const effectiveStart = certStart
        const effectiveEnd = pkEnd

        // Only include if the period overlaps with our analysis window
        if (effectiveEnd >= startDate && effectiveStart <= endDate) {
          estimatedPeriods.push({
            certId: cert.subject_key_identifier || "",
            period: estimatedPeriod,
            range: {
              start: Math.max(effectiveStart, startDate),
              end: Math.min(effectiveEnd, endDate),
            },
          })
        }
      }
      return
    }

    const period = cert.private_key_usage_period

    // Calculate the effective range for this certificate
    const effectiveStart = period.not_before || 0
    const effectiveEnd = period.not_after || endDate

    // Only include if the period overlaps with our analysis window
    if (effectiveEnd >= startDate && effectiveStart <= endDate) {
      actualPeriods.push({
        certId: cert.subject_key_identifier || "",
        period,
        range: {
          start: Math.max(effectiveStart, startDate),
          end: Math.min(effectiveEnd, endDate),
        },
      })
    }
  })

  // Combine all periods for coverage calculation
  const allPeriods = [...actualPeriods, ...estimatedPeriods]

  // Sort periods by start time
  allPeriods.sort((a, b) => a.range.start - b.range.start)

  // Merge overlapping periods to find coverage
  const mergedRanges: TimeRange[] = []
  allPeriods.forEach(({ range }) => {
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

  const hasPrivateKeyData = actualPeriods.length > 0

  // If no private key data and not including estimated, return special case
  if (!hasPrivateKeyData && !includeEstimated) {
    return {
      percentage: -1, // Special value to indicate unknown coverage
      totalDaysInPeriod: totalDays,
      coveredDays: 0,
      gaps: [],
      hasGaps: false,
      hasPrivateKeyData: false,
      certificatesWithoutPeriods,
      details: {
        actualPeriods: [],
        estimatedPeriods: [],
      },
    }
  }

  return {
    percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
    totalDaysInPeriod: totalDays,
    coveredDays,
    gaps,
    hasGaps: gaps.some((gap) => gap.durationDays > 30),
    hasPrivateKeyData,
    certificatesWithoutPeriods,
    details: {
      actualPeriods: actualPeriods.map((p) => ({
        certId: p.certId,
        period: p.period,
        startDate: new Date(p.range.start * 1000),
        endDate: new Date(p.range.end * 1000),
      })),
      estimatedPeriods: estimatedPeriods.map((p) => ({
        certId: p.certId,
        period: p.period,
        startDate: new Date(p.range.start * 1000),
        endDate: new Date(p.range.end * 1000),
      })),
    },
  }
}
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
