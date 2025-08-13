import React from "react"
import { AlertCircle } from "lucide-react"
import type { PackagedCertificate } from "@zkpassport/utils"
import TimelineDates from "../ui/timelineDates"
import TimelineVisualization from "./TimelineVisualisation"
import { calculatePrivateKeyUsagePeriodCoverage } from "@/lib/privateKeyUsagePeriod"


interface CertificateTimelineProps {
  certificates: PackagedCertificate[]
  className?: string
}

const CertificateTimeline: React.FC<CertificateTimelineProps> = ({
  certificates,
  className = "",
}) => {
  const sortedCerts = [...certificates].sort(
    (a, b) => a.validity.not_before - b.validity.not_before,
  )
  const earliestDate = new Date(Math.min(...certificates.map((c) => c.validity.not_before * 1000)))
  const latestDate = new Date(Math.max(...certificates.map((c) => c.validity.not_after * 1000)))

  // Common timeline calculations
  const now = new Date()
  const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000)

  // Find gaps in certificate validity coverage
  const certGaps: Array<{ from: Date; to: Date }> = []
  for (let i = 0; i < sortedCerts.length - 1; i++) {
    const currentEnd = new Date(sortedCerts[i].validity.not_after * 1000)
    const nextStart = new Date(sortedCerts[i + 1].validity.not_before * 1000)
    if (currentEnd < nextStart) {
      certGaps.push({ from: currentEnd, to: nextStart })
    }
  }

  // Use our private key usage period helper to calculate coverage and gaps
  const pkCoverage = calculatePrivateKeyUsagePeriodCoverage(certificates, now, 10)
  const hasAnyPrivateKeyData = pkCoverage.hasPrivateKeyData

  // Calculate unified timeline bounds for consistent reference line placement
  const certsWithPrivateKey = sortedCerts.filter((cert) => cert.private_key_usage_period)
  let unifiedTimelineStart = Math.min(earliestDate.getTime(), tenYearsAgo.getTime())
  let unifiedTimelineEnd = Math.max(latestDate.getTime(), now.getTime())

  if (certsWithPrivateKey.length > 0) {
    const pkEarliestDate = new Date(
      Math.min(
        ...certsWithPrivateKey
          .filter((c) => c.private_key_usage_period?.not_before)
          .map((c) => (c.private_key_usage_period?.not_before || 0) * 1000),
      ),
    )
    const pkLatestDate = new Date(
      Math.max(
        ...certsWithPrivateKey
          .filter((c) => c.private_key_usage_period?.not_after)
          .map((c) => (c.private_key_usage_period?.not_after || 0) * 1000),
      ),
    )

    if (!isNaN(pkEarliestDate.getTime())) {
      unifiedTimelineStart = Math.min(unifiedTimelineStart, pkEarliestDate.getTime())
    }
    if (!isNaN(pkLatestDate.getTime())) {
      unifiedTimelineEnd = Math.max(unifiedTimelineEnd, pkLatestDate.getTime())
    }
  }

  const timelineStart = new Date(unifiedTimelineStart)
  const timelineEnd = new Date(unifiedTimelineEnd)

  return (
      <div className={className}>
        <div className="space-y-3 mb-4">
          {/* Coverage Gaps */}
          {certGaps.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-orange-900">Certificate Coverage Gaps</p>
                  <div className="mt-2 space-y-1">
                    {certGaps.map((gap, i) => {
                      const gapDays = Math.ceil(
                        (gap.to.getTime() - gap.from.getTime()) / (1000 * 60 * 60 * 24),
                      )
                      return (
                        <p key={i} className="text-xs text-orange-700">
                          {gap.from.toLocaleDateString()} to {gap.to.toLocaleDateString()} (
                          {gapDays} days)
                        </p>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Certificate Validity Timeline */}
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-4">Certificate Validity Period</p>
            <div
              className="relative bg-gray-100 rounded-lg p-2"
              style={{
                height: `${Math.max((sortedCerts.length - 1) * 12 + 17, 60)}px`,
              }}
            >
              {(() => {
                const certPeriods = sortedCerts.map((cert, index) => ({
                  start: cert.validity.not_before,
                  end: cert.validity.not_after,
                  isActive: new Date(cert.validity.not_after * 1000) > now,
                  label: `Certificate ${index + 1}\n${new Date(cert.validity.not_before * 1000).toLocaleDateString()} - ${new Date(cert.validity.not_after * 1000).toLocaleDateString()}\n${new Date(cert.validity.not_after * 1000) < now ? "Expired" : "Active"}`,
                }))

                return (
                  <TimelineVisualization
                    periods={certPeriods}
                    timelineStart={timelineStart}
                    timelineEnd={timelineEnd}
                    color={{ active: "bg-blue-500", inactive: "bg-gray-400" }}
                  />
                )
              })()}
            </div>
            <TimelineDates timelineStart={timelineStart} timelineEnd={timelineEnd} />
          </div>

          {/* Private Key Usage Period Timeline */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm font-medium text-gray-700">Private Key Usage Period</p>
              {hasAnyPrivateKeyData && (
                <span className="text-xs text-gray-500">
                  {pkCoverage.percentage.toFixed(1)}% coverage
                </span>
              )}
            </div>

            {/* Legend for private key timeline */}
            {pkCoverage.details.estimatedPeriods.length > 0 && (
              <div className="flex items-center gap-4 mb-2 text-xs text-gray-600">
                <div className="flex items-center gap-1 pb-4">
                  <div className="w-4 h-2 bg-purple-400 rounded-sm border border-purple-600 border-dashed"></div>
                  <span>Estimated (4 years)</span>
                </div>
              </div>
            )}
            <>
              <div
                className="relative bg-gray-100 rounded-lg p-2"
                style={{
                  height: `${Math.max((sortedCerts.length - 1) * 12 + 17, 60)}px`,
                }}
              >
                {(() => {
                  // Get periods from our coverage calculation
                  const actualPkPeriods = pkCoverage.details.actualPeriods.map((p, index) => {
                    const isActive = now >= p.startDate && now <= p.endDate

                    return {
                      start: p.period.not_before || 0,
                      end: p.period.not_after || Date.now() / 1000,
                      isActive,
                      label: `Private Key ${index + 1}\n${p.startDate.toLocaleDateString()} - ${p.endDate.toLocaleDateString()}\n${isActive ? "Active" : "Inactive"}`,
                      isEstimated: false,
                    }
                  })

                  const estimatedPkPeriods = pkCoverage.details.estimatedPeriods.map((p, index) => {
                    const isActive = now >= p.startDate && now <= p.endDate

                    return {
                      start: p.period.not_before || 0,
                      end: p.period.not_after || Date.now() / 1000,
                      isActive,
                      label: `Estimated Private Key ${index + 1}\n${p.startDate.toLocaleDateString()} - ${p.endDate.toLocaleDateString()}\n${isActive ? "Active (estimated)" : "Inactive (estimated)"}`,
                      isEstimated: true,
                    }
                  })

                  // Combine actual and estimated periods
                  const allPkPeriods = [...actualPkPeriods, ...estimatedPkPeriods]

                  return (
                    <TimelineVisualization
                      periods={allPkPeriods}
                      timelineStart={timelineStart}
                      timelineEnd={timelineEnd}
                      color={{
                        active: "bg-green-500",
                        inactive: "bg-gray-400",
                        activeEstimated: "bg-purple-400",
                        inactiveEstimated: "bg-purple-300",
                      }}
                    />
                  )
                })()}
              </div>
              <TimelineDates timelineStart={timelineStart} timelineEnd={timelineEnd} />

              {pkCoverage.gaps.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-900">
                        Private Key Coverage Gaps
                      </p>
                      <p className="text-[10px] text-yellow-700">Over last 10 years</p>
                      <div className="mt-2 space-y-1">
                        {pkCoverage.gaps.map((gap, i) => (
                          <p key={i} className="text-xs text-yellow-700">
                            {gap.start.toLocaleDateString()} to {gap.end.toLocaleDateString()} (
                            {gap.durationDays} days)
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          </div>
        </div>
      </div>
  )
}

export default CertificateTimeline
