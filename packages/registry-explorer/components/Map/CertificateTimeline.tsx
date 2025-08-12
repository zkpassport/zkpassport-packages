import React from "react"
import { AlertCircle } from "lucide-react"
import type { PackagedCertificate } from "@zkpassport/utils"

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

  // Find gaps in coverage
  const gaps: Array<{ from: Date; to: Date }> = []
  for (let i = 0; i < sortedCerts.length - 1; i++) {
    const currentEnd = new Date(sortedCerts[i].validity.not_after * 1000)
    const nextStart = new Date(sortedCerts[i + 1].validity.not_before * 1000)
    if (currentEnd < nextStart) {
      gaps.push({ from: currentEnd, to: nextStart })
    }
  }

  return (
    <div className={className}>
      {/* Coverage Gaps */}
      {gaps.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-900">Coverage Gaps Detected</p>
              <div className="mt-2 space-y-1">
                {gaps.map((gap, i) => (
                  <p key={i} className="text-xs text-orange-700">
                    Gap from {gap.from.toLocaleDateString()} to {gap.to.toLocaleDateString()}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Timeline */}
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-700 mb-4">Certificate Timeline</p>
        <div
          className="relative bg-gray-100 rounded-lg p-2"
          style={{
            height: `${Math.max((sortedCerts.length - 1) * 12 + 17, 60)}px`,
          }}
        >
          {(() => {
            const now = new Date()
            const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000)

            // Extend timeline to include 10 years ago if needed
            const timelineStart = new Date(Math.min(earliestDate.getTime(), tenYearsAgo.getTime()))
            const timelineEnd = new Date(Math.max(latestDate.getTime(), now.getTime()))
            const totalDays =
              (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)

            // Calculate current date position
            const nowOffset =
              ((now.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100

            // Calculate 10 years ago position
            const tenYearsAgoOffset =
              ((tenYearsAgo.getTime() - timelineStart.getTime()) /
                (1000 * 60 * 60 * 24) /
                totalDays) *
              100

            return (
              <>
                {/* 10 Years Ago Reference Line */}
                <div
                  className="absolute top-2 bottom-0 w-0.5 bg-purple-400 opacity-50"
                  style={{ left: `${tenYearsAgoOffset}%` }}
                  title="10 years ago - typical passport validity"
                >
                  <span className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-purple-600 whitespace-nowrap">
                    10y ago
                  </span>
                </div>

                {/* Current Date Line */}
                <div
                  className="absolute top-2 bottom-0 w-0.5 bg-red-500 z-20"
                  style={{ left: `${nowOffset}%` }}
                  title={`Today: ${now.toLocaleDateString()}`}
                >
                  <span className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs text-red-600 font-medium whitespace-nowrap">
                    Today
                  </span>
                </div>

                {/* Certificate Bars */}
                {sortedCerts.map((cert, index) => {
                  const startOffset =
                    ((cert.validity.not_before * 1000 - timelineStart.getTime()) /
                      (1000 * 60 * 60 * 24) /
                      totalDays) *
                    100
                  const width =
                    ((cert.validity.not_after * 1000 - cert.validity.not_before * 1000) /
                      (1000 * 60 * 60 * 24) /
                      totalDays) *
                    100
                  const isActive = new Date(cert.validity.not_after * 1000) > now
                  const isExpired = new Date(cert.validity.not_after * 1000) < now

                  return (
                    <div
                      key={cert.subject_key_identifier || index}
                      className={`absolute h-3 rounded-sm transition-all hover:z-10 hover:shadow-md ${
                        isActive ? "bg-blue-500" : "bg-gray-400"
                      }`}
                      style={{
                        left: `${startOffset}%`,
                        width: `${width}%`,
                        top: `${index * 12 + 2}px`,
                        opacity: isActive ? 1 : 0.6,
                      }}
                      title={`Certificate ${index + 1}\n${new Date(cert.validity.not_before * 1000).toLocaleDateString()} - ${new Date(cert.validity.not_after * 1000).toLocaleDateString()}\n${isExpired ? "Expired" : "Active"}`}
                    />
                  )
                })}
              </>
            )
          })()}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>
            {new Date(
              Math.min(
                earliestDate.getTime(),
                new Date().getTime() - 10 * 365 * 24 * 60 * 60 * 1000,
              ),
            ).getFullYear()}
          </span>
          <span className="text-red-600 font-medium">Now</span>
          <span>
            {new Date(Math.max(latestDate.getTime(), new Date().getTime())).getFullYear()}
          </span>
        </div>
      </div>
    </div>
  )
}

export default CertificateTimeline
