"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingAnimation } from "@/components/LoadingAnimation"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, AlertCircle, GitCompare, ArrowUpDown } from "lucide-react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState, Suspense } from "react"
import {
  countryCodeAlpha3ToName,
  PackagedCertificate,
  PackagedCertificatesFile,
} from "@zkpassport/utils"
import { getCertificateUrl, getChainId } from "@/lib/certificate-url"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiffState {
  beforeData: PackagedCertificatesFile | null
  afterData: PackagedCertificatesFile | null
  beforeRootHash: string | null
  afterRootHash: string | null
  beforeUrl: string | null
  afterUrl: string | null
  isLoading: boolean
  error: string | null
}

type ChangeCategory =
  | "added"
  | "removed"
  | "expired"
  | "trust_increased"
  | "trust_decreased"
  | "trust_changed"
  | "other"

interface FieldChange {
  field: string
  oldValue: string
  newValue: string
}

interface CertificateChange {
  certificate: PackagedCertificate
  changeType: ChangeCategory
  beforeCertificate?: PackagedCertificate
  oldTags?: string[]
  newTags?: string[]
  fieldChanges?: FieldChange[]
}

interface CertificateDiff {
  added: CertificateChange[]
  removed: CertificateChange[]
  expired: CertificateChange[]
  trustIncreased: CertificateChange[]
  trustDecreased: CertificateChange[]
  trustChanged: CertificateChange[]
  other: CertificateChange[]
}

// ─── Category display order & styling ─────────────────────────────────────────

const CATEGORY_ORDER: ChangeCategory[] = [
  "added",
  "expired",
  "removed",
  "trust_increased",
  "trust_decreased",
  "trust_changed",
  "other",
]

const CATEGORY_CONFIG: Record<
  ChangeCategory,
  {
    label: string
    summarySign: string
    icon: string
    color: string
    darkColor: string
    bg: string
    border: string
  }
> = {
  added: {
    label: "Added",
    summarySign: "+",
    icon: "+",
    color: "text-green-600",
    darkColor: "dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
  },
  removed: {
    label: "Removed",
    summarySign: "−",
    icon: "−",
    color: "text-red-600",
    darkColor: "dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
  },
  expired: {
    label: "Expired",
    summarySign: "−",
    icon: "⏱",
    color: "text-orange-600",
    darkColor: "dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-900/20",
    border: "border-orange-200 dark:border-orange-800",
  },
  trust_increased: {
    label: "Trust Increased",
    summarySign: "↑",
    icon: "↑",
    color: "text-teal-600",
    darkColor: "dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-900/20",
    border: "border-teal-200 dark:border-teal-800",
  },
  trust_decreased: {
    label: "Trust Decreased",
    summarySign: "↓",
    icon: "↓",
    color: "text-amber-600",
    darkColor: "dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
  },
  trust_changed: {
    label: "Trust Changed",
    summarySign: "~",
    icon: "~",
    color: "text-blue-600",
    darkColor: "dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
  },
  other: {
    label: "Other",
    summarySign: "~",
    icon: "?",
    color: "text-purple-600",
    darkColor: "dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    border: "border-purple-200 dark:border-purple-800",
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise legacy "ICAO" tag to "UN" */
const normalizeTags = (tags?: string[]): string[] =>
  (tags || []).map((tag: string) => (tag === "ICAO" ? "UN" : tag))

/** Compare every field *except* tags & fingerprint between two certs */
const detectFieldChanges = (
  before: PackagedCertificate,
  after: PackagedCertificate,
): FieldChange[] => {
  const changes: FieldChange[] = []
  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-GB")

  if (before.country !== after.country) {
    changes.push({ field: "Country", oldValue: before.country, newValue: after.country })
  }
  if (before.signature_algorithm !== after.signature_algorithm) {
    changes.push({
      field: "Signature Algorithm",
      oldValue: before.signature_algorithm,
      newValue: after.signature_algorithm,
    })
  }
  if (JSON.stringify(before.public_key) !== JSON.stringify(after.public_key)) {
    const describeKey = (pk: PackagedCertificate["public_key"]) => {
      if (!pk) return "N/A"
      if (pk.type === "RSA") return `RSA-${pk.key_size}`
      if (pk.type === "EC") return `EC ${pk.curve}`
      return "Unknown"
    }
    changes.push({
      field: "Public Key",
      oldValue: describeKey(before.public_key),
      newValue: describeKey(after.public_key),
    })
  }
  if (JSON.stringify(before.validity) !== JSON.stringify(after.validity)) {
    changes.push({
      field: "Validity",
      oldValue: `${fmtDate(before.validity.not_before)} – ${fmtDate(before.validity.not_after)}`,
      newValue: `${fmtDate(after.validity.not_before)} – ${fmtDate(after.validity.not_after)}`,
    })
  }
  if (before.subject_key_identifier !== after.subject_key_identifier) {
    changes.push({
      field: "Subject Key Identifier",
      oldValue: before.subject_key_identifier || "N/A",
      newValue: after.subject_key_identifier || "N/A",
    })
  }
  if (before.authority_key_identifier !== after.authority_key_identifier) {
    changes.push({
      field: "Authority Key Identifier",
      oldValue: before.authority_key_identifier || "N/A",
      newValue: after.authority_key_identifier || "N/A",
    })
  }
  if (before.type !== after.type) {
    changes.push({ field: "Type", oldValue: before.type || "N/A", newValue: after.type || "N/A" })
  }
  if (
    JSON.stringify(before.private_key_usage_period) !==
    JSON.stringify(after.private_key_usage_period)
  ) {
    changes.push({
      field: "Private Key Usage Period",
      oldValue: JSON.stringify(before.private_key_usage_period ?? "N/A"),
      newValue: JSON.stringify(after.private_key_usage_period ?? "N/A"),
    })
  }

  return changes
}

/** Look up changes array for a given category key */
const getDiffCategory = (diff: CertificateDiff, category: ChangeCategory): CertificateChange[] => {
  switch (category) {
    case "added":
      return diff.added
    case "removed":
      return diff.removed
    case "expired":
      return diff.expired
    case "trust_increased":
      return diff.trustIncreased
    case "trust_decreased":
      return diff.trustDecreased
    case "trust_changed":
      return diff.trustChanged
    case "other":
      return diff.other
  }
}

const getTotalChanges = (diff: CertificateDiff): number =>
  CATEGORY_ORDER.reduce((sum, cat) => sum + getDiffCategory(diff, cat).length, 0)

// ─── Main component ───────────────────────────────────────────────────────────

function CertificateDiffContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const beforeRoot = searchParams.get("before")
  const afterRoot = searchParams.get("after")

  const [diffState, setDiffState] = useState<DiffState>({
    beforeData: null,
    afterData: null,
    beforeRootHash: null,
    afterRootHash: null,
    beforeUrl: null,
    afterUrl: null,
    isLoading: false,
    error: null,
  })

  const [visibleTypes, setVisibleTypes] = useState<Record<ChangeCategory, boolean>>({
    added: true,
    removed: true,
    expired: true,
    trust_increased: true,
    trust_decreased: true,
    trust_changed: true,
    other: true,
  })

  const toggleVisibility = (type: ChangeCategory) => {
    setVisibleTypes((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  // ── Fetch certificate data from root hashes ──────────────────────────────

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

        const extractRootFromData = (data: PackagedCertificatesFile): string | null => {
          const serialised = data.serialised as unknown as string[] | string[][]
          if (Array.isArray(serialised) && serialised.length > 0) {
            let root = serialised[serialised.length - 1]
            if (Array.isArray(root) && root.length === 1) {
              root = root[0]
            }
            return typeof root === "string" ? root : null
          }
          return null
        }

        const beforeRootHash = beforeRoot.startsWith("http")
          ? extractRootFromData(beforeData)
          : beforeRoot
        const afterRootHash = afterRoot.startsWith("http")
          ? extractRootFromData(afterData)
          : afterRoot

        setDiffState({
          beforeData,
          afterData,
          beforeRootHash,
          afterRootHash,
          beforeUrl: beforeRoot.startsWith("http") ? beforeRoot : null,
          afterUrl: afterRoot.startsWith("http") ? afterRoot : null,
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

  // ── Utility ──────────────────────────────────────────────────────────────

  const formatRoot = (root: string | null): string => {
    if (!root || typeof root !== "string") return ""
    if (root.endsWith(".json") || root.startsWith("http")) return root
    return root.startsWith("0x") ? root : `0x${root}`
  }

  const handleSwapRoots = () => {
    if (beforeRoot && afterRoot) {
      const newParams = new URLSearchParams(searchParams.toString())
      newParams.set("before", afterRoot)
      newParams.set("after", beforeRoot)
      router.push(`?${newParams.toString()}`)
    }
  }

  // ── Diff calculation (fingerprint-based) ─────────────────────────────────

  const calculateCertificateDiff = (
    beforeCerts: PackagedCertificate[],
    afterCerts: PackagedCertificate[],
    afterTimestamp?: number,
  ): CertificateDiff => {
    const beforeMap = new Map<string, PackagedCertificate>()
    const afterMap = new Map<string, PackagedCertificate>()

    // Build maps keyed by fingerprint
    beforeCerts.forEach((cert) => {
      if (cert.fingerprint) beforeMap.set(cert.fingerprint, cert)
    })
    afterCerts.forEach((cert) => {
      if (cert.fingerprint) afterMap.set(cert.fingerprint, cert)
    })

    const diff: CertificateDiff = {
      added: [],
      removed: [],
      expired: [],
      trustIncreased: [],
      trustDecreased: [],
      trustChanged: [],
      other: [],
    }

    // Added: present in after but absent from before
    afterMap.forEach((cert, fp) => {
      if (!beforeMap.has(fp)) {
        diff.added.push({ certificate: cert, changeType: "added" })
      }
    })

    // Removed / expired / modified: iterate before list
    beforeMap.forEach((beforeCert, fp) => {
      if (!afterMap.has(fp)) {
        // Fingerprint gone → expired or removed
        const isExpired =
          afterTimestamp != null &&
          beforeCert.validity?.not_after != null &&
          beforeCert.validity.not_after <= afterTimestamp

        if (isExpired) {
          diff.expired.push({ certificate: beforeCert, changeType: "expired" })
        } else {
          diff.removed.push({ certificate: beforeCert, changeType: "removed" })
        }
      } else {
        // Present in both → check what changed
        const afterCert = afterMap.get(fp)!
        const beforeTags = normalizeTags(beforeCert.tags)
        const afterTags = normalizeTags(afterCert.tags)

        const tagsChanged =
          beforeTags.length !== afterTags.length ||
          beforeTags.some((t) => !afterTags.includes(t)) ||
          afterTags.some((t) => !beforeTags.includes(t))

        const fieldChanges = detectFieldChanges(beforeCert, afterCert)

        if (tagsChanged) {
          const change: CertificateChange = {
            certificate: afterCert,
            changeType: "trust_changed",
            beforeCertificate: beforeCert,
            oldTags: beforeTags,
            newTags: afterTags,
            fieldChanges: fieldChanges.length > 0 ? fieldChanges : undefined,
          }

          const addedTags = afterTags.filter((t) => !beforeTags.includes(t))
          const removedTags = beforeTags.filter((t) => !afterTags.includes(t))

          if (addedTags.length > 0 && removedTags.length === 0) {
            // Only new tags were added — pure trust increase
            change.changeType = "trust_increased"
            diff.trustIncreased.push(change)
          } else if (removedTags.length > 0 && addedTags.length === 0) {
            // Only existing tags were removed — pure trust decrease
            change.changeType = "trust_decreased"
            diff.trustDecreased.push(change)
          } else {
            diff.trustChanged.push(change)
          }
        } else if (fieldChanges.length > 0) {
          diff.other.push({
            certificate: afterCert,
            changeType: "other",
            beforeCertificate: beforeCert,
            fieldChanges,
          })
        }
      }
    })

    return diff
  }

  // ── Render a single certificate change card ──────────────────────────────

  const renderCertificateChange = (change: CertificateChange) => {
    const config = CATEGORY_CONFIG[change.changeType]
    const cert = change.certificate

    return (
      <div
        key={cert.fingerprint || Math.random()}
        className={`p-3 border rounded-lg text-sm ${config.bg} ${config.border}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className={`${config.color} ${config.darkColor} font-bold`}>{config.icon}</span>
            <span className="font-medium">{config.label}</span>
          </div>
          {cert.validity?.not_after && (
            <div className="text-xs text-muted-foreground">
              Expiry:{" "}
              {new Date(cert.validity.not_after * 1000).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
          )}
        </div>

        {/* Certificate details */}
        <div className="space-y-2">
          <div>
            <span className="text-lg font-bold">{countryCodeAlpha3ToName(cert.country)} </span>{" "}
            <span className="text-medium">({cert.country})</span>
          </div>
          <div className="text-sm">
            {cert.signature_algorithm} {cert.public_key?.key_size || "Unknown Key Size"}
          </div>
          {cert.validity?.not_before && cert.validity?.not_after && (
            <div className="text-xs text-muted-foreground">
              Validity Period:{" "}
              {new Date(cert.validity.not_before * 1000).toLocaleDateString("en-GB")} to{" "}
              {new Date(cert.validity.not_after * 1000).toLocaleDateString("en-GB")}
            </div>
          )}
          {cert.public_key && (
            <div className="text-xs text-muted-foreground space-y-1 mt-1">
              <div className="font-medium">
                {cert.public_key.type === "RSA" && "RSA Public Key"}
                {cert.public_key.type === "EC" &&
                  `EC Public Key (${cert.public_key.curve || "Unknown Curve"})`}
              </div>
              {cert.public_key.type === "RSA" && (
                <>
                  <div className="font-mono break-all text-[10px]">
                    <span className="font-semibold">n:</span> {cert.public_key.modulus}
                  </div>
                  <div className="font-mono break-all text-[10px]">
                    <span className="font-semibold">e:</span> {cert.public_key.exponent}
                  </div>
                </>
              )}
              {cert.public_key.type === "EC" && (
                <>
                  <div className="font-mono break-all text-[10px]">
                    <span className="font-semibold">x:</span> {cert.public_key.public_key_x}
                  </div>
                  <div className="font-mono break-all text-[10px]">
                    <span className="font-semibold">y:</span> {cert.public_key.public_key_y}
                  </div>
                </>
              )}
            </div>
          )}
          {cert.fingerprint && (
            <div className="text-xs text-muted-foreground font-mono break-all">
              Fingerprint: {cert.fingerprint}
            </div>
          )}
          {cert.authority_key_identifier && (
            <div className="text-xs text-muted-foreground font-mono break-all">
              AKI: {cert.authority_key_identifier}
            </div>
          )}
          {cert.subject_key_identifier && (
            <div className="text-xs text-muted-foreground font-mono break-all">
              SKI: {cert.subject_key_identifier}
            </div>
          )}
        </div>

        {/* Tags diff for trust-related changes */}
        {change.oldTags && change.newTags ? (
          <div className="mt-2">
            <span className="font-medium">Tags:</span>{" "}
            {(() => {
              const removedTags = change.oldTags!.filter((tag) => !change.newTags!.includes(tag))
              const addedTags = change.newTags!.filter((tag) => !change.oldTags!.includes(tag))
              const unchangedTags = change.oldTags!.filter((tag) => change.newTags!.includes(tag))
              const allTags = [
                ...removedTags.map((tag) => ({ tag, type: "removed" as const })),
                ...addedTags.map((tag) => ({ tag, type: "added" as const })),
                ...unchangedTags.map((tag) => ({ tag, type: "unchanged" as const })),
              ]
              if (allTags.length === 0) return "None"
              return allTags.map(({ tag, type }, i) => (
                <span key={`${tag}-${i}`}>
                  {type === "removed" && (
                    <span className="text-red-600 dark:text-red-400 line-through">{tag}</span>
                  )}
                  {type === "added" && (
                    <span className="text-green-600 dark:text-green-500 font-bold">{tag}</span>
                  )}
                  {type === "unchanged" && <span>{tag}</span>}
                  {i < allTags.length - 1 && ", "}
                </span>
              ))
            })()}
          </div>
        ) : cert.tags && cert.tags.length > 0 ? (
          <div className="mt-2">
            <span className="font-medium">Tags:</span> {normalizeTags(cert.tags).join(", ")}
          </div>
        ) : null}

        {/* Field changes (for "other" category, or additional changes alongside trust) */}
        {change.fieldChanges && change.fieldChanges.length > 0 && (
          <div className="mt-2 space-y-1">
            <span className="font-medium text-xs">Field changes:</span>
            {change.fieldChanges.map((fc, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium">{fc.field}:</span>{" "}
                <span className="text-red-600 dark:text-red-400 line-through">{fc.oldValue}</span>
                {" → "}
                <span className="text-green-600 dark:text-green-500 font-semibold">
                  {fc.newValue}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Render change list ───────────────────────────────────────────────────

  const renderDiffList = (diff: CertificateDiff) => {
    const totalChanges = getTotalChanges(diff)

    if (totalChanges === 0) {
      return (
        <div className="text-center text-muted-foreground py-8">
          No differences found between certificate sets
        </div>
      )
    }

    const hasAnyVisible = CATEGORY_ORDER.some((cat) => visibleTypes[cat])
    if (!hasAnyVisible) {
      return (
        <div className="text-center text-muted-foreground py-8">
          All change types are hidden. Click on the cards above to show changes.
        </div>
      )
    }

    const visibleCount = CATEGORY_ORDER.reduce(
      (sum, cat) => sum + (visibleTypes[cat] ? getDiffCategory(diff, cat).length : 0),
      0,
    )

    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground mb-4">
          {visibleCount !== totalChanges ? (
            <>
              Showing {visibleCount} of {totalChanges} change
              {totalChanges !== 1 ? "s" : ""}
            </>
          ) : (
            <>
              {totalChanges} change{totalChanges !== 1 ? "s" : ""} found
            </>
          )}
        </div>
        <div className="space-y-2">
          {CATEGORY_ORDER.map((cat) =>
            visibleTypes[cat]
              ? getDiffCategory(diff, cat).map((change) => renderCertificateChange(change))
              : null,
          )}
        </div>
      </div>
    )
  }

  // ── Render summary cards ─────────────────────────────────────────────────

  const renderDiffSummary = (diff: CertificateDiff) => {
    if (!diffState.beforeData || !diffState.afterData) return null

    const beforeCount = diffState.beforeData.certificates?.length || 0
    const afterCount = diffState.afterData.certificates?.length || 0
    const totalChanges = getTotalChanges(diff)

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
            {/* Category cards */}
            {CATEGORY_ORDER.map((cat) => {
              const items = getDiffCategory(diff, cat)
              if (items.length === 0) return null
              const config = CATEGORY_CONFIG[cat]
              return (
                <button
                  key={cat}
                  onClick={() => toggleVisibility(cat)}
                  className={`p-3 ${config.bg} rounded-lg border ${config.border} text-center min-w-28 cursor-pointer hover:shadow-md transition-all ${
                    !visibleTypes[cat] ? "opacity-40" : ""
                  }`}
                >
                  <div className={`text-xl font-bold ${config.color} ${config.darkColor}`}>
                    {config.summarySign}
                    {items.length}
                  </div>
                  <div className={`text-xs ${config.color} ${config.darkColor}`}>
                    {config.label}
                  </div>
                </button>
              )
            })}
            {totalChanges === 0 && (
              <div className="p-3 bg-gray-50 dark:bg-gray-900/20 rounded-lg border border-gray-200 dark:border-gray-600 text-center min-w-28">
                <div className="text-xl font-bold text-gray-600 dark:text-gray-400">0</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">No Changes</div>
              </div>
            )}

            {/* Context: before / after counts */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-800 text-center min-w-28">
              <div className="text-xl font-semibold text-slate-400 dark:text-slate-500">
                {beforeCount}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500">Before</div>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-slate-200 dark:border-slate-800 text-center min-w-28">
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

  // ── Page layout ──────────────────────────────────────────────────────────

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
            {diffState.afterData?.timestamp && (
              <div className="mb-4 text-sm text-muted-foreground">
                <span className="font-medium">Updated on </span>{" "}
                {new Date(diffState.afterData.timestamp * 1000).toLocaleString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  timeZoneName: "short",
                })}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="space-y-2 text-sm flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="font-medium text-red-600 dark:text-red-400 flex-shrink-0">
                    Before:
                  </span>
                  <span className="font-mono text-xs sm:text-sm bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded break-all sm:truncate">
                    {diffState.beforeRootHash
                      ? formatRoot(diffState.beforeRootHash)
                      : formatRoot(beforeRoot)}
                    {diffState.beforeUrl && (
                      <span className="text-muted-foreground ml-1">
                        (
                        <a
                          href={diffState.beforeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {diffState.beforeUrl}
                        </a>
                        )
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="font-medium text-green-600 dark:text-green-400 flex-shrink-0">
                    After:
                  </span>
                  <span className="font-mono text-xs sm:text-sm bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded break-all sm:truncate">
                    {diffState.afterRootHash
                      ? formatRoot(diffState.afterRootHash)
                      : formatRoot(afterRoot)}
                    {diffState.afterUrl && (
                      <span className="text-muted-foreground ml-1">
                        (
                        <a
                          href={diffState.afterUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {diffState.afterUrl}
                        </a>
                        )
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSwapRoots}
                disabled={!beforeRoot || !afterRoot}
                className="flex-shrink-0 self-start"
                title="Swap before and after"
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
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
                diffState.afterData.timestamp,
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
