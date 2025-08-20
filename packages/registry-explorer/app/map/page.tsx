"use client"

import { WorldMap, Sidebar } from "@/components/Map"
import { useState, useEffect, Suspense } from "react"
import { useCertificates } from "@/hooks/useCertificates"
import { useHistoricalCertificateRoots } from "@/hooks/useHistoricalCertificateRoots"
import type { PackagedCertificate } from "@zkpassport/utils"
import { CountryData } from "@/lib/types"
import { coverageCache } from "@/lib/coverageCache"
import CoverageInfoModal from "@/components/CoverageInfoModal"
import { Info } from "lucide-react"

function MapPageContent() {
  const [selectedCountry, setSelectedCountry] = useState<{ code: string; name: string } | null>(
    null,
  )
  const [resetMap, setResetMap] = useState(false)
  const [countryData, setCountryData] = useState<CountryData>({})
  const [certificatesByCountry, setCertificatesByCountry] = useState<
    Record<string, PackagedCertificate[]>
  >({})
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false)
  const [recentlyUpdatedCountries, setRecentlyUpdatedCountries] = useState<Set<string>>(new Set())

  // Fetch certificates using the hook
  const { certificates, isLoading, error } = useCertificates()

  // Fetch historical roots for diff display
  const { roots: historicalRoots, isLoading: rootsLoading } = useHistoricalCertificateRoots()

  // Process certificates when they're loaded
  useEffect(() => {
    const processCertificates = async () => {
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

        // Convert to Map for coverage calculation
        const certsByCountryMap = new Map(Object.entries(certsByCountry))

        // Calculate private key usage period coverage using cache
        const coverageData = await coverageCache.getCoverage(certsByCountryMap)

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

          // Get coverage data for this country
          const countryCoverage = coverageData.get(countryCode)

          newCountryData[countryCode] = {
            support: support,
            dateRange: {
              from: new Date(minDate).toISOString().split("T")[0],
              to: new Date(maxDate).toISOString().split("T")[0],
            },
            certificateCount: countryCerts.length,
            hasExtendedCoverage: countryCerts.length > 15,
            privateKeyUsagePeriodCoverage: countryCoverage
              ? {
                  percentage: countryCoverage.percentage,
                  coveredDays: countryCoverage.coveredDays,
                  totalDaysInPeriod: countryCoverage.totalDaysInPeriod,
                  hasGaps: countryCoverage.hasGaps,
                  hasPrivateKeyData: countryCoverage.hasPrivateKeyData,
                  certificatesWithoutPeriods: countryCoverage.certificatesWithoutPeriods,
                }
              : undefined,
            hasRecentUpdate: recentlyUpdatedCountries.has(countryCode),
          }
        })
        setCountryData(newCountryData)
        console.log("Country data created with coverage:", newCountryData)
      }
    }

    processCertificates()
  }, [certificates, recentlyUpdatedCountries])

  const handleCountryClick = (countryCode: string, countryName: string) => {
    setSelectedCountry({ code: countryCode, name: countryName })
  }

  const handleCloseCountry = () => {
    setSelectedCountry(null)
    setResetMap(true)
    setTimeout(() => setResetMap(false), 100)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="bg-background border-b border-border px-4 py-2 md:py-3 flex-shrink-0 relative z-40">
        <div className="container mx-auto flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg md:text-2xl font-bold truncate text-foreground">
              Certificate Registry Map
            </h1>
            <p className="text-muted-foreground text-xs md:text-sm mt-0.5 md:mt-1 line-clamp-2">
              Interactive map showing countries with supported documents in the ZKPassport registry
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1 md:pt-2 flex-shrink-0">
            <button
              onClick={() => setIsInfoModalOpen(true)}
              className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 rounded-md transition-colors touch-manipulation"
              title="Info"
            >
              <Info className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Info</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop Layout: Sidebar + Map */}
        <div className="hidden lg:flex flex-1 min-h-0">
          <Sidebar
            selectedCountry={selectedCountry}
            certificatesByCountry={certificatesByCountry}
            certificates={certificates}
            historicalRoots={historicalRoots}
            isLoading={isLoading}
            rootsLoading={rootsLoading}
            error={error}
            onCloseCountry={handleCloseCountry}
            onRecentlyUpdatedCountries={setRecentlyUpdatedCountries}
            countryData={countryData}
          />

          {/* Map Container */}
          <div className="flex-1 relative bg-muted/20 dark:bg-muted/10 overflow-hidden">
            <WorldMap
              data={isLoading ? {} : countryData}
              recentlyUpdatedCountries={recentlyUpdatedCountries}
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

        {/* Mobile Layout: Vertical Stack */}
        <div className="lg:hidden flex flex-col flex-1 min-h-0">
          {/* Map Container - Top Half */}
          <div className="flex-1 relative bg-muted/20 dark:bg-muted/10 overflow-hidden min-h-[50vh] h-[50vh] max-h-[60vh]">
            <WorldMap
              data={isLoading ? {} : countryData}
              recentlyUpdatedCountries={recentlyUpdatedCountries}
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

          {/* Sidebar - Bottom Half */}
          <div className="flex-1 overflow-y-auto bg-background border-t border-border">
            <Sidebar
              selectedCountry={selectedCountry}
              certificatesByCountry={certificatesByCountry}
              certificates={certificates}
              historicalRoots={historicalRoots}
              isLoading={isLoading}
              rootsLoading={rootsLoading}
              error={error}
              onCloseCountry={handleCloseCountry}
              onRecentlyUpdatedCountries={setRecentlyUpdatedCountries}
              isMobileLayout={true}
              countryData={countryData}
            />
          </div>
        </div>
      </div>

      {/* Coverage Info Modal */}
      <CoverageInfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />
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
          <div className="flex flex-1 min-h-0 items-center justify-center px-4">
            <div className="inline-flex items-center gap-2 text-gray-600">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-sm md:text-base">Loading map...</span>
            </div>
          </div>
        </div>
      }
    >
      <MapPageContent />
    </Suspense>
  )
}
