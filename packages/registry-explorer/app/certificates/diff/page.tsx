"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingAnimation } from "@/components/LoadingAnimation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, AlertCircle, GitCompare } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import { PackagedCertificatesFile } from "@zkpassport/registry"
import { countryCodeAlpha3ToName, PackagedCertificate } from "@zkpassport/utils"
import { getCertificateUrl, getChainId } from "@/lib/certificate-url"

interface DiffState {
  beforeData: PackagedCertificatesFile | null
  afterData: PackagedCertificatesFile | null
  isLoading: boolean
  error: string | null
}

interface CertificateChange {
  certificate: PackagedCertificate
  changeType: "added" | "removed" | "modified"
  oldTags?: string[]
  newTags?: string[]
  oldHashAlgorithm?: string
  newHashAlgorithm?: string
}

interface CertificateDiff {
  added: PackagedCertificate[]
  removed: PackagedCertificate[]
  modified: CertificateChange[]
}

function CertificateDiffContent() {
  const searchParams = useSearchParams()
  const beforeRoot = searchParams.get("before")
  const afterRoot = searchParams.get("after")

  const [diffState, setDiffState] = useState<DiffState>({
    beforeData: null,
    afterData: null,
    isLoading: false,
    error: null,
  })

  // Fetch certificate data from root hashes
  useEffect(() => {
    const fetchCertificateData = async () => {
      if (!beforeRoot || !afterRoot) {
        setDiffState((prev) => ({
          ...prev,
          error: "Both 'before' and 'after' root hash parameters are required",
        }))
        return
      }

      setDiffState((prev) => ({ ...prev, isLoading: true, error: null }))

      // Get chain ID and construct URLs from root hashes, local JSON files, or direct URLs
      const chainId = getChainId()
      const beforeUrl = beforeRoot.startsWith("http")
        ? beforeRoot
        : beforeRoot.endsWith(".json")
          ? `/${beforeRoot}`
          : getCertificateUrl(beforeRoot, chainId)
      const afterUrl = afterRoot.startsWith("http")
        ? afterRoot
        : afterRoot.endsWith(".json")
          ? `/${afterRoot}`
          : getCertificateUrl(afterRoot, chainId)

      try {
        const [beforeResponse, afterResponse] = await Promise.all([
          fetch(beforeUrl),
          fetch(afterUrl),
        ])

        if (!beforeResponse.ok) {
          throw new Error(
            `Failed to fetch before data: ${beforeResponse.status} ${beforeResponse.statusText}`,
          )
        }

        if (!afterResponse.ok) {
          throw new Error(
            `Failed to fetch after data: ${afterResponse.status} ${afterResponse.statusText}`,
          )
        }

        const [beforeData, afterData] = await Promise.all([
          beforeResponse.json(),
          afterResponse.json(),
        ])

        setDiffState({
          beforeData,
          afterData,
          isLoading: false,
          error: null,
        })
      } catch (error) {
        setDiffState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        }))
      }
    }

    fetchCertificateData()
  }, [beforeRoot, afterRoot])

  const formatRoot = (root: string) => {
    if (root.endsWith(".json") || root.startsWith("http")) {
      return root
    }
    return root.startsWith("0x") ? root : `0x${root}`
  }

  // Function to generate unique certificate key
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

  // Function to calculate certificate differences
  const calculateCertificateDiff = (
    beforeCerts: PackagedCertificate[],
    afterCerts: PackagedCertificate[],
  ): CertificateDiff => {
    const beforeMap = new Map<string, PackagedCertificate>()
    const afterMap = new Map<string, PackagedCertificate>()

    // Create maps using the proper unique identifier
    beforeCerts.forEach((cert) => {
      const key = getCertificateKey(cert)
      if (key) {
        beforeMap.set(key, cert)
      }
    })

    afterCerts.forEach((cert) => {
      const key = getCertificateKey(cert)
      if (key) {
        afterMap.set(key, cert)
      }
    })

    const added: PackagedCertificate[] = []
    const removed: PackagedCertificate[] = []
    const modified: CertificateChange[] = []

    // Find added certificates
    afterMap.forEach((cert, id) => {
      if (!beforeMap.has(id)) {
        added.push(cert)
      }
    })

    // Find removed certificates and modified certificates
    beforeMap.forEach((beforeCert, id) => {
      if (!afterMap.has(id)) {
        removed.push(beforeCert)
      } else {
        const afterCert = afterMap.get(id)!

        // Compare tags and hash algorithm
        const beforeTags = beforeCert.tags || []
        const afterTags = afterCert.tags || []

        const tagsChanged =
          beforeTags.length !== afterTags.length ||
          beforeTags.some((tag) => !afterTags.includes(tag)) ||
          afterTags.some((tag) => !beforeTags.includes(tag))

        const hashAlgorithmChanged = beforeCert.hash_algorithm !== afterCert.hash_algorithm

        if (tagsChanged || hashAlgorithmChanged) {
          modified.push({
            certificate: afterCert,
            changeType: "modified",
            oldTags: beforeTags,
            newTags: afterTags,
            oldHashAlgorithm: hashAlgorithmChanged ? beforeCert.hash_algorithm : undefined,
            newHashAlgorithm: hashAlgorithmChanged ? afterCert.hash_algorithm : undefined,
          })
        }
      }
    })

    return { added, removed, modified }
  }

  const renderCertificateChange = (
    cert: PackagedCertificate,
    changeType: "added" | "removed" | "modified",
    oldTags?: string[],
    newTags?: string[],
    oldHashAlgorithm?: string,
    newHashAlgorithm?: string,
  ) => {
    const getChangeTypeStyle = (type: "added" | "removed" | "modified") => {
      switch (type) {
        case "added":
          return "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
        case "removed":
          return "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
        case "modified":
          return "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
      }
    }

    const getChangeTypeIcon = (type: "added" | "removed" | "modified") => {
      switch (type) {
        case "added":
          return <span className="text-green-600 dark:text-green-400 font-bold">+</span>
        case "removed":
          return <span className="text-red-600 dark:text-red-400 font-bold">-</span>
        case "modified":
          return <span className="text-blue-600 dark:text-blue-400 font-bold">~</span>
      }
    }

    return (
      <div
        key={cert.subject_key_identifier || Math.random()}
        className={`p-3 border rounded-lg text-sm ${getChangeTypeStyle(changeType)}`}
      >
        <div className="flex items-center gap-2 mb-2">
          {getChangeTypeIcon(changeType)}
          <span className="font-medium capitalize">{changeType}</span>
        </div>

        <div className="space-y-2">
          <div>
            <span className="text-lg font-bold">{countryCodeAlpha3ToName(cert.country)} </span>{" "}
            <span className="text-medium ">({cert.country})</span>
          </div>
          <div className="text-sm">
            {cert.signature_algorithm} {cert.public_key?.key_size || "Unknown Key Size"} &bull;{" "}
            {oldHashAlgorithm && newHashAlgorithm ? (
              <>
                <span className="text-red-600 dark:text-red-400 line-through">
                  {oldHashAlgorithm}
                </span>{" "}
                <span className="text-green-600 dark:text-green-500 font-bold">
                  {newHashAlgorithm}
                </span>
              </>
            ) : (
              cert.hash_algorithm
            )}
          </div>
        </div>

        {changeType === "modified" && oldTags && newTags ? (
          <div className="mt-2">
            <span className="font-medium">Tags:</span>{" "}
            {(() => {
              const removedTags = oldTags.filter((tag) => !newTags.includes(tag))
              const addedTags = newTags.filter((tag) => !oldTags.includes(tag))
              const unchangedTags = oldTags.filter((tag) => newTags.includes(tag))

              const allTags = [
                ...removedTags.map((tag) => ({ tag, type: "removed" })),
                ...addedTags.map((tag) => ({ tag, type: "added" })),
                ...unchangedTags.map((tag) => ({ tag, type: "unchanged" })),
              ]

              if (allTags.length === 0) return "None"

              return allTags.map(({ tag, type }, index) => (
                <span key={`${tag}-${index}`}>
                  {type === "removed" && (
                    <span className="text-red-600 dark:text-red-400 line-through">{tag}</span>
                  )}
                  {type === "added" && (
                    <span className="text-green-600 dark:text-green-500 font-bold">{tag}</span>
                  )}
                  {type === "unchanged" && <span>{tag}</span>}
                  {index < allTags.length - 1 && ", "}
                </span>
              ))
            })()}
          </div>
        ) : cert.tags && cert.tags.length > 0 ? (
          <div className="mt-2">
            <span className="font-medium">Tags:</span> {cert.tags.join(", ")}
          </div>
        ) : null}
      </div>
    )
  }

  const renderDiffList = (diff: CertificateDiff) => {
    const totalChanges = diff.added.length + diff.removed.length + diff.modified.length

    if (totalChanges === 0) {
      return (
        <div className="text-center text-muted-foreground py-8">
          No differences found between certificate sets
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground mb-4">
          {totalChanges} change{totalChanges !== 1 ? "s" : ""} found
        </div>
        <div className="space-y-2">
          {diff.added.map((cert) => renderCertificateChange(cert, "added"))}
          {diff.removed.map((cert) => renderCertificateChange(cert, "removed"))}
          {diff.modified.map((change) =>
            renderCertificateChange(
              change.certificate,
              "modified",
              change.oldTags,
              change.newTags,
              change.oldHashAlgorithm,
              change.newHashAlgorithm,
            ),
          )}
        </div>
      </div>
    )
  }

  const renderDiffSummary = (diff: CertificateDiff) => {
    if (!diffState.beforeData || !diffState.afterData) return null

    const beforeCount = diffState.beforeData.certificates?.length || 0
    const afterCount = diffState.afterData.certificates?.length || 0
    const totalChanges = diff.added.length + diff.removed.length + diff.modified.length

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Diff Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {/* Change Cards First */}
            {diff.added.length > 0 && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 text-center min-w-28">
                <div className="text-xl font-bold text-green-600 dark:text-green-400">
                  +{diff.added.length}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400">Added</div>
              </div>
            )}
            {diff.removed.length > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-center min-w-28">
                <div className="text-xl font-bold text-red-600 dark:text-red-400">
                  -{diff.removed.length}
                </div>
                <div className="text-xs text-red-600 dark:text-red-400">Removed</div>
              </div>
            )}
            {diff.modified.length > 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center min-w-28">
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  ~{diff.modified.length}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400">Modified</div>
              </div>
            )}
            {totalChanges === 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg border border-gray-200 dark:border-gray-600 text-center min-w-28">
                <div className="text-xl font-bold text-gray-600 dark:text-gray-400">0</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">No Changes</div>
              </div>
            )}

            {/* Context Cards at the End */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-800 text-center min-w-28">
              <div className="text-xl font-semibold text-slate-400 dark:text-slate-500">
                {beforeCount}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500">Before</div>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-600 text-center min-w-28">
              <div className="text-xl font-semibold text-slate-600 dark:text-slate-400">
                {afterCount}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">After</div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="container mx-auto py-6 px-4 sm:py-10">
      <div className="flex items-center gap-4 mb-5">
        <Button variant="outline" size="sm" asChild>
          <Link href="/certificates/history">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </Link>
        </Button>
      </div>

      {diffState.error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{diffState.error}</AlertDescription>
        </Alert>
      )}

      {!beforeRoot || !afterRoot ? (
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This page requires &apos;before&apos; and &apos;after&apos; root hash parameters to
            compare certificate files.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="mb-6">
            <h1 className="text-xl sm:text-2xl font-bold mb-4">Comparing Certificate Roots</h1>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-red-600 dark:text-red-400 flex-shrink-0">
                  Before:
                </span>
                <span className="font-mono bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded truncate">
                  {formatRoot(beforeRoot)}
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-green-600 dark:text-green-400 flex-shrink-0">
                  After:
                </span>
                <span className="font-mono bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded truncate">
                  {formatRoot(afterRoot)}
                </span>
              </div>
            </div>
          </div>

          {diffState.isLoading ? (
            <div className="flex justify-center items-center py-12">
              <LoadingAnimation />
            </div>
          ) : diffState.beforeData && diffState.afterData ? (
            (() => {
              const diff = calculateCertificateDiff(
                diffState.beforeData.certificates || [],
                diffState.afterData.certificates || [],
              )

              return (
                <>
                  {renderDiffSummary(diff)}

                  <div>
                    <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                      <GitCompare className="h-5 w-5" />
                      Certificate Changes
                    </h2>
                    {renderDiffList(diff)}
                  </div>
                </>
              )
            })()
          ) : null}
        </>
      )}
    </div>
  )
}

export default function CertificateDiffPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto py-6 px-4 sm:py-10">
          <div className="flex justify-center items-center py-12">
            <LoadingAnimation />
          </div>
        </div>
      }
    >
      <CertificateDiffContent />
    </Suspense>
  )
}
