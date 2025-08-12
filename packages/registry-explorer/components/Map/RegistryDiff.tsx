"use client"

import React, { useEffect, useState } from "react"
import { PackagedCertificatesFile } from "@zkpassport/registry"
import { countryCodeAlpha3ToName, PackagedCertificate } from "@zkpassport/utils"
import { getCertificateUrl, getChainId } from "@/lib/certificate-url"
import { GitCompare, Plus, Minus, ExternalLink } from "lucide-react"
import Link from "next/link"

interface CertificateChange {
  certificate: PackagedCertificate
  changeType: "added" | "removed" | "modified"
}

interface CertificateDiff {
  added: PackagedCertificate[]
  removed: PackagedCertificate[]
  modified: CertificateChange[]
}

interface RegistryDiffProps {
  beforeRoot: string
  afterRoot: string
  beforeDate?: string
  afterDate?: string
}

export default function RegistryDiffSidebar({
  beforeRoot,
  afterRoot,
  beforeDate,
  afterDate,
}: RegistryDiffProps) {
  const [beforeData, setBeforeData] = useState<PackagedCertificatesFile | null>(null)
  const [afterData, setAfterData] = useState<PackagedCertificatesFile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchCertificateData = async () => {
      if (!beforeRoot || !afterRoot) return

      setIsLoading(true)
      setError(null)

      const chainId = getChainId()
      const beforeUrl = getCertificateUrl(beforeRoot, chainId)
      const afterUrl = getCertificateUrl(afterRoot, chainId)

      try {
        const [beforeResponse, afterResponse] = await Promise.all([
          fetch(beforeUrl),
          fetch(afterUrl),
        ])

        if (!beforeResponse.ok || !afterResponse.ok) {
          throw new Error("Failed to fetch certificate data")
        }

        const [beforeData, afterData] = await Promise.all([
          beforeResponse.json(),
          afterResponse.json(),
        ])

        setBeforeData(beforeData)
        setAfterData(afterData)
      } catch (error) {
        setError(error instanceof Error ? error.message : "Unknown error")
      } finally {
        setIsLoading(false)
      }
    }

    fetchCertificateData()
  }, [beforeRoot, afterRoot])

  // Reuse certificate key generation from diff page
  const getCertificateKey = (cert: PackagedCertificate): string => {
    const publicKeyParts = []
    if (cert.public_key?.type === "RSA") {
      publicKeyParts.push(cert.public_key.type, cert.public_key.modulus, cert.public_key.exponent)
    } else if (cert.public_key?.type === "EC") {
      publicKeyParts.push(
        cert.public_key.type,
        cert.public_key.curve,
        cert.public_key.public_key_x,
        cert.public_key.public_key_y,
      )
    }
    const parts = [cert.country, cert.signature_algorithm, cert.hash_algorithm, ...publicKeyParts]
    return parts.join("|")
  }

  // Calculate diff
  const calculateCertificateDiff = (
    beforeCerts: PackagedCertificate[],
    afterCerts: PackagedCertificate[],
  ): CertificateDiff => {
    const beforeMap = new Map<string, PackagedCertificate>()
    const afterMap = new Map<string, PackagedCertificate>()

    beforeCerts.forEach((cert) => {
      const key = getCertificateKey(cert)
      if (key) beforeMap.set(key, cert)
    })

    afterCerts.forEach((cert) => {
      const key = getCertificateKey(cert)
      if (key) afterMap.set(key, cert)
    })

    const added: PackagedCertificate[] = []
    const removed: PackagedCertificate[] = []
    const modified: CertificateChange[] = []

    afterMap.forEach((cert, id) => {
      if (!beforeMap.has(id)) {
        added.push(cert)
      }
    })

    beforeMap.forEach((beforeCert, id) => {
      if (!afterMap.has(id)) {
        removed.push(beforeCert)
      }
    })

    return { added, removed, modified }
  }

  if (isLoading) {
    return (
      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading diff...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-red-700">Error loading diff: {error}</p>
      </div>
    )
  }

  if (!beforeData || !afterData) {
    return null
  }

  const diff = calculateCertificateDiff(beforeData.certificates || [], afterData.certificates || [])

  const totalChanges = diff.added.length + diff.removed.length

  // Group changes by country
  const changesByCountry = new Map<string, { added: number; removed: number }>()

  diff.added.forEach((cert) => {
    const country = cert.country
    if (!changesByCountry.has(country)) {
      changesByCountry.set(country, { added: 0, removed: 0 })
    }
    changesByCountry.get(country)!.added++
  })

  diff.removed.forEach((cert) => {
    const country = cert.country
    if (!changesByCountry.has(country)) {
      changesByCountry.set(country, { added: 0, removed: 0 })
    }
    changesByCountry.get(country)!.removed++
  })

  // Sort countries by total changes
  const sortedCountries = Array.from(changesByCountry.entries()).sort(
    (a, b) => b[1].added + b[1].removed - (a[1].added + a[1].removed),
  )

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <GitCompare className="w-4 h-4" />
            <span>Registry Update</span>
          </h4>
          {beforeDate && afterDate && (
            <p className="text-xs text-gray-600 ml-6 mt-0.5">
              {new Date(beforeDate).toLocaleDateString()} →{" "}
              {(() => {
                const afterDateObj = new Date(afterDate)
                const today = new Date()
                // Check if afterDate is today or in the future
                if (afterDateObj.toDateString() === today.toDateString() || afterDateObj > today) {
                  return "Present"
                }
                return afterDateObj.toLocaleDateString()
              })()}
            </p>
          )}
        </div>
        <Link
          href={`/certificates/diff?before=${beforeRoot}&after=${afterRoot}`}
          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View full diff
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="flex gap-3 mb-3">
        {diff.added.length > 0 && (
          <div className="flex items-center gap-1">
            <Plus className="w-3 h-3 text-green-600" />
            <span className="text-sm font-semibold text-green-600">{diff.added.length}</span>
            <span className="text-xs text-gray-600">added</span>
          </div>
        )}
        {diff.removed.length > 0 && (
          <div className="flex items-center gap-1">
            <Minus className="w-3 h-3 text-red-600" />
            <span className="text-sm font-semibold text-red-600">{diff.removed.length}</span>
            <span className="text-xs text-gray-600">removed</span>
          </div>
        )}
        {totalChanges === 0 && <span className="text-xs text-gray-500">No changes</span>}
      </div>

      {/* Countries with changes */}
      {sortedCountries.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-700 mb-1">Countries affected:</p>
          {sortedCountries.map(([country, changes]) => (
            <div
              key={country}
              className="flex items-center justify-between text-xs bg-white/50 rounded px-2 py-1"
            >
              <span className="font-medium">{countryCodeAlpha3ToName(country)}</span>
              <div className="flex items-center gap-2">
                {changes.added > 0 && (
                  <span className="text-green-600 font-medium">+{changes.added}</span>
                )}
                {changes.removed > 0 && (
                  <span className="text-red-600 font-medium">-{changes.removed}</span>
                )}
              </div>
            </div>
          ))}
          {changesByCountry.size > 5 && (
            <p className="text-xs text-gray-500 text-center pt-1">
              +{changesByCountry.size - 5} more countries
            </p>
          )}
        </div>
      )}

      {/* Root hashes - compact display */}
      <div className="mt-3 pt-3 border-t border-blue-200 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">From:</span>
          <span className="font-mono text-gray-700 truncate" title={beforeRoot}>
            {beforeRoot.substring(0, 10)}...
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">To:</span>
          <span className="font-mono text-gray-700 truncate" title={afterRoot}>
            {afterRoot.substring(0, 10)}...
          </span>
        </div>
      </div>
    </div>
  )
}
