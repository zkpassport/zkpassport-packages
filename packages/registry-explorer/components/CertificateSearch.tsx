"use client"

import { useEffect } from "react"
import { useCertificates } from "@/hooks/useCertificates"
import { CertificateFilters } from "./certificate/CertificateFilters"
import { CertificateList } from "./certificate/CertificateList"
import { isECDSA, isRSA } from "@/lib/certificate-utils"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  TotalCertificatesIcon,
  CountriesIcon,
  RSACertificatesIcon,
  ECDSACertificatesIcon,
  SelectedRootIcon,
  CopyIcon,
  PreviousRootIcon,
  NextRootIcon,
  FilterCertificatesIcon,
} from "./certificate/StatsCardIcons"

export default function CertificateSearch() {
  const router = useRouter()
  const {
    certificates,
    filteredCertificates,
    isLoading,
    error,
    filterState,
    uniqueCountries,
    // uniqueHashAlgorithms,
    uniqueCurves,
    updateFilter,
    currentRoot,
    isLatestRoot,
    availableRoots,
  } = useCertificates()

  // Reset RSA type when signature type changes
  useEffect(() => {
    if (filterState.selectedSignatureType !== "rsa") {
      updateFilter("selectedRSAType", "all")
    }

    // Reset curve when signature type changes
    if (filterState.selectedSignatureType !== "ecdsa") {
      updateFilter("selectedCurve", "all")
    }
  }, [filterState.selectedSignatureType, updateFilter])

  // Handle root change
  const handleRootChange = (value: string) => {
    if (value === "latest") {
      router.push("/certificates")
    } else {
      router.push(`/certificates?root=${value}`)
    }
  }

  const currentRootIndex = availableRoots.findIndex((r) => r.root === currentRoot)
  const isGenesisRoot = currentRootIndex === 0

  const navigateToPreviousRoot = () => {
    if (currentRootIndex > 0) {
      const prevRoot = availableRoots[currentRootIndex - 1].root
      router.push(`/certificates?root=${prevRoot}`)
    }
  }

  const navigateToNextRoot = () => {
    if (currentRootIndex >= 0 && currentRootIndex < availableRoots.length - 1) {
      const nextIndex = currentRootIndex + 1
      if (nextIndex === availableRoots.length - 1) {
        router.push("/certificates")
      } else {
        router.push(`/certificates?root=${availableRoots[nextIndex].root}`)
      }
    }
  }

  return (
    <div className="min-h-screen">
      {/* Error Message */}
      {error && (
        <div className="mx-auto max-w-2xl my-4 px-4 py-3 bg-red-100 border border-red-400 text-red-700 rounded">
          <p className="font-medium">Error loading certificates:</p>
          <p>{error}</p>
        </div>
      )}

      {/* Root Information */}
      {currentRoot && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex flex-col space-y-3 lg:flex-row lg:items-center lg:justify-between lg:space-y-0 lg:space-x-6">
            <div className="flex items-start sm:items-center min-w-0 flex-1">
              <SelectedRootIcon
                className="h-4 w-4 mr-2.5 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5 sm:mt-0"
                strokeWidth={1.5}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Selected Root
                </h2>
                <div className="flex items-center flex-wrap gap-2 mt-0.5">
                  <code className="text-xs sm:text-sm font-mono text-gray-900 dark:text-white break-all">
                    <span className="sm:hidden">{currentRoot.substring(0, 20)}...</span>
                    <span className="hidden sm:inline">{currentRoot}</span>
                  </code>
                  <button
                    className="flex-shrink-0 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(currentRoot)
                    }}
                    title="Copy root hash to clipboard"
                  >
                    <CopyIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                  {isLatestRoot && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
                      Latest
                    </span>
                  )}
                </div>
              </div>
            </div>

            {availableRoots.length > 0 && (
              <div className="flex items-center space-x-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToPreviousRoot}
                  disabled={isGenesisRoot || currentRootIndex < 0}
                  title="Previous root (older)"
                  className="h-8 w-8 p-0"
                >
                  <PreviousRootIcon className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <div className="w-full sm:w-56">
                  <Select
                    value={isLatestRoot ? "latest" : currentRoot}
                    onValueChange={handleRootChange}
                  >
                    <SelectTrigger className="w-full h-8 text-xs bg-white dark:bg-gray-700">
                      <SelectValue placeholder="Select a root" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest" className="cursor-pointer text-xs">
                        Latest Root
                      </SelectItem>
                      {[...availableRoots].reverse().map((rootDetails) => (
                        <SelectItem
                          key={rootDetails.root}
                          value={rootDetails.root}
                          disabled={rootDetails.root === currentRoot}
                          className="cursor-pointer text-xs"
                        >
                          {rootDetails.root.substring(0, 10)}... (
                          {rootDetails.validFrom.toLocaleDateString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={navigateToNextRoot}
                  disabled={isLatestRoot || currentRootIndex < 0}
                  title="Next root (newer)"
                  className="h-8 w-8 p-0"
                >
                  <NextRootIcon className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="container mx-auto">
        <div className="space-y-6 sm:space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
                    Total Certificates
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    {certificates.length}
                  </dd>
                </div>
                <TotalCertificatesIcon
                  className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-3"
                  strokeWidth={1.5}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
                    Countries
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    {uniqueCountries.length}
                  </dd>
                </div>
                <CountriesIcon
                  className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-3"
                  strokeWidth={1.5}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
                    RSA Certificates
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    {certificates.filter((cert) => isRSA(cert)).length}
                  </dd>
                </div>
                <RSACertificatesIcon
                  className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-3"
                  strokeWidth={1.5}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none px-4 py-3 sm:px-5 sm:py-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate">
                    ECDSA Certificates
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    {certificates.filter((cert) => isECDSA(cert)).length}
                  </dd>
                </div>
                <ECDSACertificatesIcon
                  className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-3"
                  strokeWidth={1.5}
                />
              </div>
            </div>
          </div>

          {/* Search and Filter Section with Card UI */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-none border border-gray-200 dark:border-gray-700 px-4 py-4 sm:px-5 sm:py-5">
            <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center mb-4">
              <FilterCertificatesIcon
                className="h-4 w-4 mr-2 text-gray-400 dark:text-gray-500"
                strokeWidth={1.5}
              />
              Filter Certificates
            </h2>

            <CertificateFilters
              filterState={filterState}
              uniqueCountries={uniqueCountries}
              // uniqueHashAlgorithms={uniqueHashAlgorithms}
              uniqueCurves={uniqueCurves}
              onFilterChange={updateFilter}
            />
          </div>

          {/* Results Header */}
          <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 sm:h-6 sm:w-6 mr-2 text-blue-500 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span>Certificates</span>
              <span className="ml-3 text-sm font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                {filteredCertificates.length}
              </span>
            </h2>

            {filteredCertificates.length > 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Showing {filteredCertificates.length}{" "}
                {filteredCertificates.length === 1 ? "certificate" : "certificates"} across{" "}
                {new Set(filteredCertificates.map((c) => c.country)).size} countries
              </div>
            )}
          </div>

          {/* Results Section */}
          <CertificateList certificates={filteredCertificates} isLoading={isLoading} />
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white dark:bg-transparent mt-12">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="border-t border-gray-200 dark:border-gray-700 pt-8 md:flex md:items-center md:justify-between">
            <div className="flex items-center space-x-6 md:order-2">
              <a href="https://docs.zkpassport.id" className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">Documentation</span>
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                </svg>
              </a>
              <a href="https://github.com/zkpassport" className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">GitHub</span>
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.268C19.137 20.007 22 16.46 22 12.017 22 6.484 17.522 2 12 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            </div>
            <div className="mt-8 md:mt-0 md:order-1">
              <p className="text-base text-gray-400">&copy; 2025 ZKPassport</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
