"use client"

import WorldMap from "@/components/ui/WorldMap"
import { useState, useEffect, Suspense } from "react"
import { Globe, Calendar, AlertCircle, X } from "lucide-react"
import Link from "next/link"
import { useCertificates } from "@/hooks/useCertificates"
import { useHistoricalCertificateRoots } from "@/hooks/useHistoricalCertificateRoots"
import type { PackagedCertificate } from "@zkpassport/utils"
import RegistryDiff from "@/components/ui/RegistryDiff"

function MapPageContent() {
  const [selectedCountry, setSelectedCountry] = useState<{ code: string; name: string } | null>(
    null,
  )
  const [resetMap, setResetMap] = useState(false)
  const [countryData, setCountryData] = useState<
    Record<
      string,
      {
        support: "full" | "partial" | "none"
        dateRange?: { from: string; to: string }
        hasExtendedCoverage?: boolean
        certificateCount?: number
      }
    >
  >({})
  const [certificatesByCountry, setCertificatesByCountry] = useState<
    Record<string, PackagedCertificate[]>
  >({})

  // Fetch certificates using the hook
  const { certificates, isLoading, error } = useCertificates()

  // Fetch historical roots for diff display
  const { roots: historicalRoots, isLoading: rootsLoading } = useHistoricalCertificateRoots()

  // Process certificates when they're loaded
  useEffect(() => {
    if (certificates && certificates.length > 0) {
      console.log("Processing certificates:", certificates.length)

      // Group certificates by country
      const certsByCountry: Record<string, PackagedCertificate[]> = {}
      certificates.forEach((cert) => {
        if (!certsByCountry[cert.country]) {
          certsByCountry[cert.country] = []
        }
        certsByCountry[cert.country].push(cert)
      })
      setCertificatesByCountry(certsByCountry)
      console.log("Certificates by country:", Object.keys(certsByCountry).length, "countries")

      // Create country data based on certificates
      const newCountryData: typeof countryData = {}
      Object.entries(certsByCountry).forEach(([countryCode, countryCerts]) => {
        // Determine support level based on certificate count
        // More granular levels: 1-2 minimal, 3-5 basic, 6-10 partial, 11-20 good, 20+ full
        const certCount = countryCerts.length
        let support: "full" | "partial" = "partial"
        if (certCount >= 20) support = "full"
        else if (certCount >= 11) support = "full" // We'll use certificateCount for more granular coloring

        // Calculate date range
        const validFromDates = countryCerts.map((c) => c.validity.not_before * 1000)
        const validToDates = countryCerts.map((c) => c.validity.not_after * 1000)
        const minDate = Math.min(...validFromDates)
        const maxDate = Math.max(...validToDates)

        newCountryData[countryCode] = {
          support: support,
          dateRange: {
            from: new Date(minDate).toISOString().split("T")[0],
            to: new Date(maxDate).toISOString().split("T")[0],
          },
          certificateCount: countryCerts.length,
          hasExtendedCoverage: countryCerts.length > 15,
        }
      })
      setCountryData(newCountryData)
      console.log("Country data created:", newCountryData)
    }
  }, [certificates])

  const handleCountryClick = (countryCode: string, countryName: string) => {
    setSelectedCountry({ code: countryCode, name: countryName })
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex-shrink-0">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold">Certificate Registry Map</h1>
          <p className="text-gray-600 text-sm mt-1">
            Interactive map showing countries with supported documents in the ZKPassport registry
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-80 bg-white border-r overflow-y-auto flex-shrink-0">
          <div className="p-4">
            {selectedCountry && certificatesByCountry[selectedCountry.code] ? (
              // Show country details when selected
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">{selectedCountry.name}</h3>
                  <button
                    onClick={() => {
                      setSelectedCountry(null)
                      setResetMap(true)
                      setTimeout(() => setResetMap(false), 100)
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Coverage Summary */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-2xl font-bold text-blue-900">
                        {certificatesByCountry[selectedCountry.code].length}
                        <span className="text-sm text-blue-700"> certificates in registry</span>
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="text-gray-700">
                        Coverage from{" "}
                        <strong>
                          {new Date(
                            Math.min(
                              ...certificatesByCountry[selectedCountry.code].map(
                                (c) => c.validity.not_before * 1000,
                              ),
                            ),
                          ).toLocaleDateString()}
                        </strong>{" "}
                        to{" "}
                        <strong>
                          {new Date(
                            Math.max(
                              ...certificatesByCountry[selectedCountry.code].map(
                                (c) => c.validity.not_after * 1000,
                              ),
                            ),
                          ).toLocaleDateString()}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Visual Timeline */}
                {(() => {
                  const certs = certificatesByCountry[selectedCountry.code]
                  const sortedCerts = [...certs].sort(
                    (a, b) => a.validity.not_before - b.validity.not_before,
                  )
                  const earliestDate = new Date(
                    Math.min(...certs.map((c) => c.validity.not_before * 1000)),
                  )
                  const latestDate = new Date(
                    Math.max(...certs.map((c) => c.validity.not_after * 1000)),
                  )

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
                    <>
                      {/* Coverage Gaps */}
                      {gaps.length > 0 && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-orange-900">
                                Coverage Gaps Detected
                              </p>
                              <div className="mt-2 space-y-1">
                                {gaps.map((gap, i) => (
                                  <p key={i} className="text-xs text-orange-700">
                                    Gap from {gap.from.toLocaleDateString()} to{" "}
                                    {gap.to.toLocaleDateString()}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Visual Timeline */}
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-4">
                          Certificate Timeline
                        </p>
                        <div
                          className="relative bg-gray-100 rounded-lg p-2"
                          style={{
                            height: `${Math.max((sortedCerts.length - 1) * 12 + 17, 60)}px`,
                          }}
                        >
                          {(() => {
                            const now = new Date()
                            const tenYearsAgo = new Date(
                              now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000,
                            )

                            // Extend timeline to include 10 years ago if needed
                            const timelineStart = new Date(
                              Math.min(earliestDate.getTime(), tenYearsAgo.getTime()),
                            )
                            const timelineEnd = new Date(
                              Math.max(latestDate.getTime(), now.getTime()),
                            )
                            const totalDays =
                              (timelineEnd.getTime() - timelineStart.getTime()) /
                              (1000 * 60 * 60 * 24)

                            // Calculate current date position
                            const nowOffset =
                              ((now.getTime() - timelineStart.getTime()) /
                                (1000 * 60 * 60 * 24) /
                                totalDays) *
                              100

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
                                    ((cert.validity.not_after * 1000 -
                                      cert.validity.not_before * 1000) /
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
                            {new Date(
                              Math.max(latestDate.getTime(), new Date().getTime()),
                            ).getFullYear()}
                          </span>
                        </div>
                      </div>
                    </>
                  )
                })()}

                {/* Certificate Details */}
                {certificatesByCountry[selectedCountry.code] && (
                  <div className="border-t pt-3 mt-3">
                    <p className="text-xs font-medium text-gray-600 mb-2">Certificate Details</p>
                    <div className="space-y-2 pb-4">
                      {certificatesByCountry[selectedCountry.code].map((cert) => (
                        <div key={cert.subject_key_identifier} className="bg-gray-50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-700">
                              {cert.signature_algorithm}
                            </span>
                            <span
                              className={
                                cert.public_key.type === "RSA"
                                  ? "text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full"
                                  : "text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full"
                              }
                            >
                              {cert.public_key.type}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {cert.hash_algorithm}{" "}
                            {"curve" in cert.public_key &&
                              cert.public_key.curve &&
                              `• ${cert.public_key.curve}`}
                          </p>
                        </div>
                      ))}
                      {certificatesByCountry[selectedCountry.code].length > 2 && (
                        <p className="text-xs text-gray-500 text-center">
                          +{certificatesByCountry[selectedCountry.code].length - 2} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Link
                    href={`/certificates?country=${selectedCountry.code}`}
                    className="flex-1 text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    View Certificate Details
                  </Link>
                </div>
              </>
            ) : (
              // Show default registry info when no country selected
              <>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Registry Updates
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Last updated:{" "}
                    {historicalRoots.length > 0
                      ? new Date(
                          Math.max(...historicalRoots.map((root) => root.validFrom.getTime())),
                        ).toLocaleDateString()
                      : "No updates yet"}
                  </p>
                </div>

                {/* Loading State */}
                {isLoading && (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center gap-2 text-sm text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      Loading certificates...
                    </div>
                  </div>
                )}

                {/* Error State */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-red-700">Error loading certificates: {error}</p>
                  </div>
                )}

                {/* Certificate Summary */}
                {!isLoading && certificates && (
                  <div className="bg-blue-50 rounded-lg p-4 mb-6">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-blue-900">{certificates.length}</p>
                      <p className="text-sm text-blue-700">Total Certificates</p>
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-lg font-semibold text-blue-800">
                        {Object.keys(certificatesByCountry).length}
                      </p>
                      <p className="text-xs text-blue-600">Countries Covered</p>
                    </div>
                  </div>
                )}

                {/* Historical Registry Updates */}
                {!rootsLoading && historicalRoots && historicalRoots.length >= 2 && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
                      <Globe className="w-4 h-4" />
                      Registry History
                    </h4>
                    <div className="space-y-3">
                      {
                        historicalRoots
                          .slice(0, -1) // Exclude the last one since we need pairs
                          .map((root, index) => {
                            const nextRoot = historicalRoots[index + 1]
                            // Skip if either root is revoked
                            if (root.revoked || nextRoot.revoked) return null

                            return (
                              <RegistryDiff
                                key={root.root}
                                beforeRoot={nextRoot.root}
                                afterRoot={root.root}
                                beforeDate={nextRoot.validFrom.toISOString()}
                                afterDate={root.validFrom.toISOString()}
                              />
                            )
                          })
                          .filter(Boolean)
                          .slice(0, 5) // Show up to 5 most recent diffs
                      }
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative bg-gray-50 overflow-hidden">
          <WorldMap
            data={isLoading ? {} : countryData}
            registryUpdateDate={
              historicalRoots.length > 0
                ? new Date(
                    Math.max(...historicalRoots.map((root) => root.validFrom.getTime())),
                  ).toLocaleDateString()
                : "No updates yet"
            }
            onCountryClick={handleCountryClick}
            resetMapView={resetMap}
          />
        </div>
      </div>
    </div>
  )
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-screen overflow-hidden">
          <div className="bg-white border-b px-4 py-3 flex-shrink-0">
            <div className="container mx-auto">
              <h1 className="text-2xl font-bold">Certificate Registry Map</h1>
              <p className="text-gray-600 text-sm mt-1">
                Interactive map showing countries with supported documents in the zkPassport
                registry
              </p>
            </div>
          </div>
          <div className="flex flex-1 min-h-0 items-center justify-center">
            <div className="inline-flex items-center gap-2 text-gray-600">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              Loading map...
            </div>
          </div>
        </div>
      }
    >
      <MapPageContent />
    </Suspense>
  )
}
