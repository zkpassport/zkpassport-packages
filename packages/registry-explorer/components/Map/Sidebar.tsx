import React from "react"
import Link from "next/link"
import { Globe, X } from "lucide-react"
import type { PackagedCertificate } from "@zkpassport/utils"
import {
  CoverageSummary,
  CertificateTimeline,
  CertificateDetails,
  CertificateSummary,
  RegistryDiff,
} from "."

interface HistoricalRoot {
  root: string
  validFrom: Date
  revoked: boolean
}

interface SidebarProps {
  selectedCountry: { code: string; name: string } | null
  certificatesByCountry: Record<string, PackagedCertificate[]>
  certificates: PackagedCertificate[] | null
  historicalRoots: HistoricalRoot[]
  isLoading: boolean
  rootsLoading: boolean
  error: string | null
  onCloseCountry: () => void
}

const Sidebar: React.FC<SidebarProps> = ({
  selectedCountry,
  certificatesByCountry,
  certificates,
  historicalRoots,
  isLoading,
  rootsLoading,
  error,
  onCloseCountry,
}) => {
  return (
    <div className="w-80 bg-white border-r overflow-y-auto flex-shrink-0">
      <div className="p-4">
        {selectedCountry && certificatesByCountry[selectedCountry.code] ? (
          // Show country details when selected
          <>
            {/* Country Name and Close Button */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{selectedCountry.name}</h3>
              <button onClick={onCloseCountry} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Coverage Summary */}
            <CoverageSummary
              certificatesByCountry={certificatesByCountry}
              selectedCountry={selectedCountry}
            />

            <CertificateTimeline certificates={certificatesByCountry[selectedCountry.code]} />

            {/* Certificate Details */}
            {certificatesByCountry[selectedCountry.code] && (
              <CertificateDetails
                certificatesByCountry={certificatesByCountry}
                selectedCountry={selectedCountry}
              />
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
              <CertificateSummary
                certificates={certificates}
                certificatesByCountry={certificatesByCountry}
              />
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
                      .slice(0, 5) // Show up to 5 most recent diffs, maybe remove
                  }
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Sidebar
