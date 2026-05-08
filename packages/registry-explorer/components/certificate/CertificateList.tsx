"use client"

import type { PackagedCertificate } from "@zkpassport/utils"
import { CertificateCard } from "./CertificateCard"

interface CertificateListProps {
  certificates: PackagedCertificate[]
  isLoading: boolean
}

export function CertificateList({ certificates, isLoading }: CertificateListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <svg
          className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span className="text-lg font-medium">Loading certificates...</span>
      </div>
    )
  }

  if (certificates.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-2 text-lg font-medium">No certificates found</h3>
        <p className="mt-1 text-gray-500 dark:text-gray-400">Try adjusting your search criteria.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {certificates.map((cert) => (
        <CertificateCard key={getCertificateKey(cert)} cert={cert} />
      ))}
    </div>
  )
}

/**
 * Stable content-derived key so React preserves component state (e.g.
 * expanded/collapsed) across filtering and reordering.
 */
function getCertificateKey(cert: PackagedCertificate): string {
  return cert.fingerprint ?? JSON.stringify(cert).replace(/\s+/g, "")
}
