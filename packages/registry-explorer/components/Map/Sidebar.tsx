import React, { useState } from "react"
import Link from "next/link"
import { Globe, X, Menu, ChevronLeft } from "lucide-react"
import type { PackagedCertificate } from "@zkpassport/utils"
import type { CountryData } from "@/lib/types"
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
  onRecentlyUpdatedCountries?: (countries: Set<string>) => void
  isMobileLayout?: boolean
  countryData?: CountryData
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
  onRecentlyUpdatedCountries,
  isMobileLayout = false,
  countryData,
}) => {
  const [isMinimized, setIsMinimized] = useState(false)

  // Common content for both mobile and desktop
  const sidebarContent = (
    <>
      {selectedCountry && certificatesByCountry[selectedCountry.code] ? (
        // Show country details when selected
        <>
          {/* Country Name and Close Button */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold truncate">{selectedCountry.name}</h3>
            <button
              onClick={onCloseCountry}
              className="text-gray-400 hover:text-muted-foreground p-1 touch-manipulation flex-shrink-0 ml-2"
              aria-label={isMobileLayout ? "Show map" : "Close country details"}
              title={isMobileLayout ? "Back to map" : "Close country details"}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Coverage Summary */}
          <CoverageSummary
            certificatesByCountry={certificatesByCountry}
            selectedCountry={selectedCountry}
            isMobileLayout={isMobileLayout}
            countryData={countryData}
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
              className="flex-1 text-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium touch-manipulation"
            >
              View Certificate Details
            </Link>
          </div>
        </>
      ) : (
        // Show default registry info when no country selected
        <>
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Registry Updates
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
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
            <div className="text-center py-6">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                Loading certificates...
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-700 dark:text-red-400 break-words">
                Error loading certificates: {error}
              </p>
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
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
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
                          onCountriesCalculated={
                            index === 0 ? onRecentlyUpdatedCountries : undefined
                          }
                          isLatest={index === 0}
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
    </>
  )

  if (isMobileLayout) {
    // Mobile layout - simplified sidebar without toggle functionality
    return (
      <div className="w-full bg-background overflow-y-auto">
        <div className="p-4">{sidebarContent}</div>
      </div>
    )
  }

  // Desktop layout - original sidebar with toggle functionality
  return (
    <>
      {/* Mobile menu button when sidebar is hidden */}
      {isMinimized && (
        <button
          onClick={() => setIsMinimized(false)}
          className="lg:hidden fixed top-16 md:top-20 left-4 z-20 bg-background border border-border rounded-lg shadow-lg p-3 hover:bg-muted transition-colors touch-manipulation"
          aria-label="Open sidebar"
        >
          <Menu className="w-6 h-6" />
        </button>
      )}

      <div
        className={`${isMinimized ? "hidden" : "w-full sm:w-80"} lg:w-80 bg-background border-r border-border overflow-y-auto flex-shrink-0 transition-all duration-300 fixed lg:relative h-full z-30 lg:z-auto`}
      >
        {/* Mobile minimize button */}
        <button
          onClick={() => setIsMinimized(true)}
          className="lg:hidden absolute top-3 right-3 z-10 bg-muted rounded-lg p-2 hover:bg-muted/80 transition-colors touch-manipulation"
          aria-label="Hide sidebar"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="p-4 pl-4 lg:pl-6 pr-12 lg:pr-4">{sidebarContent}</div>
      </div>
    </>
  )
}

export default Sidebar
