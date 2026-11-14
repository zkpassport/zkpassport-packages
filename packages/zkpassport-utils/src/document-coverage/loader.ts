import bundled from "./snapshot.json"
import type { Coverage, CoverageDocument, CoverageDocumentType } from "./types"

export const COVERAGE_URL = "https://cdn.zkpassport.id/coverage/latest.json"

/** The copy of the table shipped with this package */
export const BUNDLED_COVERAGE = bundled as Coverage

export interface LoadCoverageOptions {
  url?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export interface LoadedCoverage {
  coverage: Coverage
  source: "remote" | "bundled"
}

/**
 * The newest table available: the CDN's when it loads, is well formed and is at least as new as
 * the bundled copy, else the bundled copy.
 */
export async function loadCoverage(options: LoadCoverageOptions = {}): Promise<LoadedCoverage> {
  const { url = COVERAGE_URL, timeoutMs = 5000 } = options
  const doFetch = options.fetch ?? globalThis.fetch
  const bundledResult: LoadedCoverage = { coverage: BUNDLED_COVERAGE, source: "bundled" }
  if (!doFetch) return bundledResult

  const controller = typeof AbortController === "function" ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  try {
    const response = await doFetch(url, { signal: controller?.signal })
    if (!response.ok) return bundledResult
    const remote = await response.json()
    if (!isCoverage(remote)) return bundledResult
    if (remote.generatedAt < BUNDLED_COVERAGE.generatedAt) return bundledResult
    return { coverage: withBundledNationalities(remote), source: "remote" }
  } catch {
    return bundledResult
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const DOCUMENT_TYPES: CoverageDocumentType[] = [
  "passport",
  "id_card",
  "residence_permit",
  "driving_license",
  "my_number_card",
  "aadhaar",
]
const READ_METHODS = ["nfc", "camera", "qr"]
const FIELDS = ["chip", "mrz", "barcode", "text"]
const NATIONALITIES = ["issuer", "printed", "none"]

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const isOptional = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v)
const isBoolean = (v: unknown) => typeof v === "boolean"
const isYear = (v: unknown) => v === null || isNumber(v)

function isDocument(v: unknown): boolean {
  return (
    isObject(v) &&
    DOCUMENT_TYPES.includes(v.type as CoverageDocumentType) &&
    typeof v.name === "string" &&
    isBoolean(v.chip) &&
    isBoolean(v.mrz) &&
    isOptional(v.from, isNumber) &&
    isOptional(v.to, isNumber) &&
    isOptional(v.barcode, isBoolean) &&
    isOptional(v.text, isBoolean) &&
    isOptional(v.nationality, (n) => NATIONALITIES.includes(n as string)) &&
    isOptional(v.deprecated, isBoolean) &&
    isOptional(v.available, isBoolean) &&
    isOptional(v.regulaId, isNumber)
  )
}

function isCountry(v: unknown): boolean {
  return (
    isObject(v) &&
    typeof v.name === "string" &&
    isObject(v.chipCertificates) &&
    isBoolean(v.chipCertificates.supported) &&
    isYear(v.chipCertificates.from) &&
    isYear(v.chipCertificates.to) &&
    isObject(v.signedSupport) &&
    ["passport", "id_card", "residence_permit"].every((k) =>
      isNumber((v.signedSupport as Record<string, unknown>)[k]),
    ) &&
    isOptional(
      v.documentNames,
      (names) => isObject(names) && Object.values(names).every((n) => typeof n === "string"),
    ) &&
    Array.isArray(v.documents) &&
    v.documents.every(isDocument)
  )
}

function isReadMethod(v: unknown): boolean {
  return (
    isObject(v) &&
    Array.isArray(v.schemes) &&
    v.schemes.every(isNumber) &&
    isOptional(v.requires, (r) => FIELDS.includes(r as string)) &&
    isOptional(
      v.requiresAny,
      (r) => Array.isArray(r) && r.every((f) => FIELDS.includes(f as string)),
    )
  )
}

/**
 * Whether a value is a whole coverage table, every country and document in it: a table from the
 * CDN is taken only if it is, so a malformed entry can't reach the decisions and break them
 */
export function isCoverage(value: unknown): value is Coverage {
  if (!isObject(value)) return false
  const { shapes, documentTypes, countries } = value
  return (
    value.schemaVersion === 1 &&
    typeof value.generatedAt === "string" &&
    isObject(shapes) &&
    ["booklet", "card"].every((key) => {
      const shape = shapes[key]
      return (
        isObject(shape) &&
        isNumber(shape.aspectRatio) &&
        (shape.orientation === "landscape" || shape.orientation === "portrait")
      )
    }) &&
    isObject(documentTypes) &&
    DOCUMENT_TYPES.every((type) => {
      const rule = documentTypes[type]
      return (
        isObject(rule) &&
        typeof rule.name === "string" &&
        (rule.shape === "booklet" || rule.shape === "card") &&
        isObject(rule.read) &&
        Object.entries(rule.read).every(
          ([method, read]) => READ_METHODS.includes(method) && isReadMethod(read),
        )
      )
    }) &&
    isObject(countries) &&
    Object.values(countries).every(isCountry)
  )
}

const STRICTNESS: Record<NonNullable<CoverageDocument["nationality"]>, number> = {
  issuer: 0,
  printed: 1,
  none: 2,
}

/**
 * A downloaded table's nationality rules, each made at least as strict as the bundled table's for
 * the same template, and "none" for one it doesn't have: the table decides what nationality a
 * text-read ID proves, so one served from the CDN can narrow it but never widen it. A wider rule
 * ships with an app update.
 */
export function withBundledNationalities(remote: Coverage): Coverage {
  const bundledRules = new Map<number, CoverageDocument["nationality"]>()
  for (const country of Object.values(BUNDLED_COVERAGE.countries)) {
    for (const document of country.documents) {
      if (document.regulaId !== undefined) bundledRules.set(document.regulaId, document.nationality)
    }
  }
  const countries = Object.fromEntries(
    Object.entries(remote.countries).map(([code, country]) => [
      code,
      {
        ...country,
        documents: country.documents.map((document) => {
          if (!document.text) return document
          const bundledRule =
            (document.regulaId !== undefined && bundledRules.get(document.regulaId)) || "none"
          const remoteRule = document.nationality ?? "none"
          const nationality =
            STRICTNESS[remoteRule] >= STRICTNESS[bundledRule] ? remoteRule : bundledRule
          return { ...document, nationality }
        }),
      },
    ]),
  )
  return { ...remote, countries }
}
