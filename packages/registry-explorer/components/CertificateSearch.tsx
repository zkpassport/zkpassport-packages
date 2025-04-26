"use client"

import { useEffect } from "react"
import { registerLocale } from "i18n-iso-countries"
import i18en from "i18n-iso-countries/langs/en.json"
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

// Register locale for country name lookup
registerLocale(i18en)

export default function CertificateSearch() {
  const router = useRouter()
  const {
    certificates,
    filteredCertificates,
    isLoading,
    error,
    filterState,
    uniqueCountries,
    uniqueHashAlgorithms,
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
      // Navigate to the certificates page without a root parameter
      router.push("/certificates")
    } else {
      // Navigate to the certificates page with the selected root
      router.push(`/certificates?root=${value}`)
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
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center mb-4 md:mb-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <div>
                <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Selected Root
                </h2>
                <div className="flex items-center">
                  <code className="text-sm font-mono text-gray-900 dark:text-white">
                    {currentRoot}
                  </code>
                  <button
                    className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(currentRoot)
                    }}
                    title="Copy root hash to clipboard"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                  </button>
                  {isLatestRoot && (
                    <span className="ml-3 text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                      Latest Root
                    </span>
                  )}
                </div>
              </div>
            </div>

            {availableRoots.length > 0 && (
              <div className="flex items-center">
                <label
                  htmlFor="rootSelector"
                  className="text-sm font-medium text-gray-500 dark:text-gray-400 mr-2"
                >
                  Select Root:
                </label>
                <div className="w-64">
                  <Select
                    value={isLatestRoot ? "latest" : currentRoot}
                    onValueChange={handleRootChange}
                  >
                    <SelectTrigger className="w-full bg-white dark:bg-gray-700">
                      <SelectValue placeholder="Select a root" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest" className="cursor-pointer">
                        Latest Root
                      </SelectItem>
                      {[...availableRoots].reverse().map((rootDetails) => (
                        <SelectItem
                          key={rootDetails.root}
                          value={rootDetails.root}
                          disabled={rootDetails.root === currentRoot}
                          className="cursor-pointer"
                        >
                          {rootDetails.root.substring(0, 10)}... (
                          {rootDetails.validFrom.toLocaleDateString()})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="container mx-auto">
        <div className="space-y-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                    <svg
                      className="h-6 w-6 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        Total Certificates
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900 dark:text-white">
                          {certificates.length}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                    <svg
                      className="h-6 w-6 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                      />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        Countries
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900 dark:text-white">
                          {uniqueCountries.length}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-indigo-500 rounded-md p-3">
                    <svg
                      className="h-6 w-6 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        RSA Certificates
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900 dark:text-white">
                          {certificates.filter((cert) => isRSA(cert)).length}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-teal-500 rounded-md p-3">
                    <svg
                      className="h-6 w-6 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                        ECDSA Certificates
                      </dt>
                      <dd>
                        <div className="text-lg font-medium text-gray-900 dark:text-white">
                          {certificates.filter((cert) => isECDSA(cert)).length}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Search and Filter Section with Card UI */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-700">
            <h2 className="text-lg font-semibold mb-5 text-gray-900 dark:text-white flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              Filter Certificates
            </h2>

            <CertificateFilters
              filterState={filterState}
              uniqueCountries={uniqueCountries}
              uniqueHashAlgorithms={uniqueHashAlgorithms}
              uniqueCurves={uniqueCurves}
              onFilterChange={updateFilter}
            />
          </div>

          {/* Results Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 mr-2 text-blue-500"
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
              Certificates
              <span className="ml-3 text-sm font-medium px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100">
                {filteredCertificates.length}
              </span>
            </h2>

            {filteredCertificates.length > 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Showing {filteredCertificates.length}{" "}
                {filteredCertificates.length === 1 ? "certificate" : "certificates"}
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
