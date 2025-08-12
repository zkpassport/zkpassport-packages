"use client"

import WorldMap from "@/components/ui/WorldMap"
import { useState, useEffect } from "react"
import { Globe, Shield, Calendar, AlertCircle, CheckCircle } from "lucide-react"
import Link from "next/link"
import { useCertificates } from "@/hooks/useCertificates"
import type { PackagedCertificate } from "@zkpassport/utils"

export default function MapPage() {
  const [selectedCountry, setSelectedCountry] = useState<{ code: string; name: string } | null>(
    null,
  )
  const [registryUpdateDate] = useState("2025-01-10")
  const [countryData, setCountryData] = useState<
    Record<
      string,
      {
        support: "full" | "partial" | "none"
        documentTypes: Array<"passport" | "id_card" | "residence_permit">
        dateRange?: { from: string; to: string }
        isNew?: boolean
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
          documentTypes: ["passport"], // Default to passport, could be enhanced
          dateRange: {
            from: new Date(minDate).toISOString().split("T")[0],
            to: new Date(maxDate).toISOString().split("T")[0],
          },
          certificateCount: countryCerts.length,
          isNew: Math.random() > 0.8, // Mock: randomly mark some as new
          hasExtendedCoverage: countryCerts.length > 15,
        }
      })
      setCountryData(newCountryData)
      console.log("Country data created:", newCountryData)
    }
  }, [certificates])

  const handleCountryClick = (countryCode: string, countryName: string) => {
    console.log("Country clicked:", countryCode, countryName)
    console.log("Country data available:", countryData[countryCode])
    console.log("Country certificates:", certificatesByCountry[countryCode]?.length || 0)
    setSelectedCountry({ code: countryCode, name: countryName })
  }

  // Get new countries and countries with extended coverage
  // const newCountries = Object.entries(mockCountryData)
  //   .filter(([_, info]) => info.isNew)
  //   .map(([code, info]) => ({ code, ...info }));

  // const extendedCountries = Object.entries(mockCountryData)
  //   .filter(([_, info]) => info.hasExtendedCoverage)
  //   .map(([code, info]) => ({ code, ...info }));

  // const getDocumentTypeIcon = (type: string) => {
  //   switch (type) {
  //     case 'passport':
  //       return '🛂';
  //     case 'id_card':
  //       return '🪪';
  //     case 'residence_permit':
  //       return '🏠';
  //     default:
  //       return '📄';
  //   }
  // };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold">Certificate Registry Map</h1>
          <p className="text-gray-600 text-sm mt-1">
            Interactive map showing countries with supported documents in the zkPassport registry
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 relative">
        {/* Left Sidebar */}
        <div className="w-80 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Registry Updates
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Last updated: {new Date(registryUpdateDate).toLocaleDateString()}
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

            {/* New Countries */}
            {/* {newCountries.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-1">
                  <Plus className="w-4 h-4" />
                  New Countries
                </h4>
                <div className="space-y-1">
                  {newCountries.map(({ code, documentTypes }) => (
                    <div
                      key={code}
                      onClick={() => handleCountryClick(code, countryCodeToName[code] || code)}
                      className={`flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedCountry?.code === code ? 'bg-blue-50 border border-blue-200' : ''
                      }`}
                    >
                      <span className="text-sm text-gray-800 font-medium">
                        {countryCodeToName[code] || code}
                      </span>
                      <div className="flex items-center gap-1">
                        {documentTypes.map((type: string) => (
                          <span key={type} className="text-xs" title={type}>
                            {getDocumentTypeIcon(type)}
                          </span>
                        ))}
                        <ChevronRight className="w-3 h-3 text-gray-400 ml-1" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )} */}

            {/* Extended Coverage
            {extendedCountries.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Extended Coverage
                </h4>
                <div className="space-y-1">
                  {extendedCountries.map(({ code, documentTypes }) => (
                    <div
                      key={code}
                      onClick={() => handleCountryClick(code, countryCodeToName[code] || code)}
                      className={`flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedCountry?.code === code ? 'bg-blue-50 border border-blue-200' : ''
                      }`}
                    >
                      <span className="text-sm text-gray-800 font-medium">
                        {countryCodeToName[code] || code}
                      </span>
                      <div className="flex items-center gap-1">
                        {documentTypes.map((type: string) => (
                          <span key={type} className="text-xs" title={type}>
                            {getDocumentTypeIcon(type)}
                          </span>
                        ))}
                        <ChevronRight className="w-3 h-3 text-gray-400 ml-1" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )} */}

            {/* {newCountries.length === 0 && extendedCountries.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No recent updates
              </p>
            )} */}
          </div>

          {/* Selected Country Details */}
          {selectedCountry &&
            (countryData[selectedCountry.code] || certificatesByCountry[selectedCountry.code]) && (
              <div className="border-t p-4">
                <h4 className="font-semibold text-gray-800 mb-3">{selectedCountry.name}</h4>

                <div className="space-y-3">
                  {/* Certificate Count */}
                  {certificatesByCountry[selectedCountry.code] && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1">
                        Certificates in Registry
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        {certificatesByCountry[selectedCountry.code].length}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Support Level</p>
                    <span
                      className={`inline-block px-2 py-1 text-xs rounded-full ${
                        countryData[selectedCountry.code]?.support === "full"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {countryData[selectedCountry.code]?.support === "full"
                        ? "Full Support"
                        : "Partial Support"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Supported Documents</p>
                    <div className="flex flex-wrap gap-1">
                      {(countryData[selectedCountry.code]?.documentTypes || ["passport"]).map(
                        (type) => (
                          <span
                            key={type}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                          >
                            {type.replace("_", " ")}
                          </span>
                        ),
                      )}
                    </div>
                  </div>

                  {countryData[selectedCountry.code]?.dateRange && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-1">Certificate Validity</p>
                      <p className="text-xs text-gray-700">
                        {new Date(
                          countryData[selectedCountry.code].dateRange!.from,
                        ).toLocaleDateString()}{" "}
                        -{" "}
                        {new Date(
                          countryData[selectedCountry.code].dateRange!.to,
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  )}

                  {/* Certificate Summary */}
                  {certificatesByCountry[selectedCountry.code] && (
                    <div className="border-t pt-3 mt-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">Certificate Details</p>
                      <div className="space-y-2">
                        {certificatesByCountry[selectedCountry.code].slice(0, 2).map((cert) => (
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

                  <div className="flex gap-2 mt-4">
                    <Link
                      href={`/certificates?country=${selectedCountry.code}`}
                      className="flex-1 text-center px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs"
                    >
                      View All Certificates
                    </Link>
                    <Link
                      href={`/certificates/history?country=${selectedCountry.code}`}
                      className="flex-1 text-center px-3 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-xs"
                    >
                      View History
                    </Link>
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Map Container */}
        <div className="flex-1 relative bg-gray-50">
          <WorldMap
            data={isLoading ? {} : countryData}
            registryUpdateDate={registryUpdateDate}
            onCountryClick={handleCountryClick}
          />

          {/* Certificate Coverage Panel - Shows when country is selected */}
          {selectedCountry &&
            certificatesByCountry[selectedCountry.code] &&
            (() => {
              const certs = certificatesByCountry[selectedCountry.code]
              const sortedCerts = [...certs].sort(
                (a, b) => a.validity.not_before - b.validity.not_before,
              )

              // Calculate coverage
              const earliestDate = new Date(
                Math.min(...certs.map((c) => c.validity.not_before * 1000)),
              )
              const latestDate = new Date(
                Math.max(...certs.map((c) => c.validity.not_after * 1000)),
              )
              const activeCerts = certs.filter(
                (cert) => new Date(cert.validity.not_after * 1000) > new Date(),
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
                <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-xl p-5 w-96 z-10">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{selectedCountry.name}</h3>
                    <button
                      onClick={() => setSelectedCountry(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Coverage Summary */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-2xl font-bold text-blue-900">{certs.length}</p>
                        <p className="text-sm text-blue-700">certificates in registry</p>
                      </div>
                      <Shield className="w-12 h-12 text-blue-500 opacity-20" />
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span className="text-gray-700">
                          Coverage from <strong>{earliestDate.toLocaleDateString()}</strong> to{" "}
                          <strong>{latestDate.toLocaleDateString()}</strong>
                        </span>
                      </div>

                      {activeCerts.length === certs.length ? (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-green-700">All certificates currently active</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-orange-600" />
                          <span className="text-orange-700">
                            {activeCerts.length} active, {certs.length - activeCerts.length} expired
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

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
                    <p className="text-sm font-medium text-gray-700 mb-2">Certificate Timeline</p>
                    <div className="relative h-20 bg-gray-100 rounded-lg p-2">
                      {sortedCerts.map((cert, index) => {
                        const totalDays =
                          (latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)
                        const startOffset =
                          ((cert.validity.not_before * 1000 - earliestDate.getTime()) /
                            (1000 * 60 * 60 * 24) /
                            totalDays) *
                          100
                        const width =
                          ((cert.validity.not_after * 1000 - cert.validity.not_before * 1000) /
                            (1000 * 60 * 60 * 24) /
                            totalDays) *
                          100
                        const isActive = new Date(cert.validity.not_after * 1000) > new Date()

                        return (
                          <div
                            key={cert.subject_key_identifier || index}
                            className={`absolute h-8 rounded transition-all hover:z-10 hover:shadow-lg ${
                              isActive ? "bg-blue-500" : "bg-gray-400"
                            }`}
                            style={{
                              left: `${startOffset}%`,
                              width: `${width}%`,
                              top: `${(index % 2) * 20 + 8}px`,
                              opacity: isActive ? 1 : 0.5,
                            }}
                            title={`${cert.country}\n${new Date(cert.validity.not_before * 1000).toLocaleDateString()} - ${new Date(cert.validity.not_after * 1000).toLocaleDateString()}`}
                          />
                        )
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{earliestDate.getFullYear()}</span>
                      <span>{latestDate.getFullYear()}</span>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-lg font-semibold text-gray-900">
                        {countryData[selectedCountry.code]?.documentTypes?.length || 1}
                      </p>
                      <p className="text-xs text-gray-600">Document types</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-lg font-semibold text-gray-900">
                        {Math.ceil(
                          (latestDate.getTime() - earliestDate.getTime()) /
                            (1000 * 60 * 60 * 24 * 365),
                        )}
                      </p>
                      <p className="text-xs text-gray-600">Years covered</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-lg font-semibold text-gray-900">
                        {gaps.length === 0 ? "✓" : gaps.length}
                      </p>
                      <p className="text-xs text-gray-600">
                        {gaps.length === 0 ? "No gaps" : "Gaps"}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link
                      href={`/certificates?country=${selectedCountry.code}`}
                      className="flex-1 text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      View Certificate Details
                    </Link>
                    <Link
                      href={`/certificates/history?country=${selectedCountry.code}`}
                      className="flex-1 text-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                    >
                      View History
                    </Link>
                  </div>
                </div>
              )
            })()}
        </div>
      </div>
    </div>
  )
}
