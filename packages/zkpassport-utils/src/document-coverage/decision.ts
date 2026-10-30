import {
  AllowedCredential,
  CredentialScheme,
  DEFAULT_ALLOWED_CREDENTIALS,
  isCredentialAllowed,
} from "../types/credential"
import type {
  Coverage,
  CoverageCountry,
  CoverageDocument,
  CoverageDocumentType,
  CoverageShape,
  ReadMethod,
} from "./types"
import { isUnState } from "./un-members"

export interface CoverageQuery {
  /** ISO 3166-1 alpha-3 code of the issuing country */
  country: string
  documentType: CoverageDocumentType
  /** Narrows the series to those in circulation that year */
  issueYear?: number
  /** What the user says about the document: whether it carries the chip symbol */
  hasChip?: boolean
  /** The relying party's policy; none means the default one */
  allowedCredentials?: readonly AllowedCredential[] | null
  /** The schemes this client can prove, e.g. the iOS app proves the chip and the camera read */
  supportedSchemes: readonly CredentialScheme[]
}

export interface VerificationPath {
  method: ReadMethod
  scheme: CredentialScheme
  /** Whether a read by this method yields a proof we can verify */
  verifiable: boolean
}

export type CoverageOutcome =
  /** Follow `paths` in order */
  | "proceed"
  /** The country has series with and without a chip; ask the user whether theirs has one */
  | "ask_chip"
  /** We could read the document, but the relying party's policy accepts none of those reads */
  | "rejected_by_policy"
  /** No method this client supports reads the document */
  | "unsupported"
  /** The country or the document type is not in the table; scan and see */
  | "unknown"

export interface CoverageDecision {
  outcome: CoverageOutcome
  /** The reads to try, first to last; empty unless the outcome is proceed or ask_chip */
  paths: VerificationPath[]
  /** Reads this client could do that the policy refuses, for the message shown */
  refusedByPolicy: VerificationPath[]
  /** Whether the series considered carry a chip */
  chip: "all" | "none" | "mixed" | "unknown"
  chipVerifiable: boolean
  /** The series considered */
  documents: CoverageDocument[]
}

const SCHEMES_PER_TIER = 100

/**
 * Which reads to attempt for a document, given the policy and what the client can prove. A chip
 * we can verify comes first with the camera as the fallback; a chip we can't verify, or no chip,
 * means the camera; a read the policy refuses is reported so the user can be told why.
 */
export function decideVerificationPaths(
  coverage: Coverage,
  query: CoverageQuery,
): CoverageDecision {
  const country = coverage.countries[query.country]
  const rule = coverage.documentTypes[query.documentType]
  const none = (outcome: CoverageOutcome): CoverageDecision => ({
    outcome,
    paths: [],
    refusedByPolicy: [],
    chip: "unknown",
    chipVerifiable: false,
    documents: [],
  })
  if (!country || !rule) return none("unknown")

  const documents = seriesInCirculation(
    country.documents.filter((d) => d.type === query.documentType),
    query.issueYear,
  )
  if (documents.length === 0) return none("unsupported")

  const chipCount = documents.filter((d) => d.chip).length
  const chipInSeries = chipCount === 0 ? "none" : chipCount === documents.length ? "all" : "mixed"
  // What the user says about their own document outweighs what the series suggest
  const chip = query.hasChip === undefined ? chipInSeries : query.hasChip ? "all" : "none"
  const chipVerifiable = chip !== "none" && certificatesCover(country, query.issueYear)
  const available = documents.filter((d) => d.available !== false)
  const has = (field: "chip" | "mrz") =>
    field === "chip" && query.hasChip !== undefined
      ? query.hasChip
      : available.some((d) => d[field])

  const candidates: VerificationPath[] = []
  if (available.length === 0) {
    return {
      outcome: "unsupported",
      paths: [],
      refusedByPolicy: [],
      chip,
      chipVerifiable,
      documents,
    }
  }
  for (const [method, read] of Object.entries(rule.read) as [
    ReadMethod,
    (typeof rule.read)[ReadMethod],
  ][]) {
    if (!read) continue
    if (read.requires && !has(read.requires)) continue
    for (const scheme of read.schemes) {
      candidates.push({
        method,
        scheme: scheme as CredentialScheme,
        // An ICAO chip is only as good as the certificate chain we hold for its country
        verifiable: scheme === CredentialScheme.ICAO_CHIP ? chipVerifiable : true,
      })
    }
  }

  const doable = candidates.filter((p) => query.supportedSchemes.includes(p.scheme))
  const allowed = query.allowedCredentials ?? DEFAULT_ALLOWED_CREDENTIALS
  const permitted = doable.filter((p) => isCredentialAllowed(p.scheme, allowed))
  const refusedByPolicy = doable.filter((p) => !isCredentialAllowed(p.scheme, allowed))
  const paths = order(permitted)

  const base = { refusedByPolicy, chip, chipVerifiable, documents } as const
  if (paths.length === 0) {
    if (refusedByPolicy.length > 0) return { outcome: "rejected_by_policy", paths, ...base }
    return { outcome: "unsupported", paths, ...base }
  }
  const outcome = chip === "mixed" ? "ask_chip" : "proceed"
  return { outcome, paths, ...base }
}

/** Verifiable chip reads first, then the attested reads; an unverifiable chip read is dropped */
function order(paths: VerificationPath[]): VerificationPath[] {
  const usable = paths.filter((p) => p.verifiable)
  const tier = (p: VerificationPath) => Math.floor(p.scheme / SCHEMES_PER_TIER)
  return [...usable].sort((a, b) => tier(a) - tier(b) || a.scheme - b.scheme)
}

/**
 * The series a document issued in a year can belong to. A series runs from its first year to
 * its last, or to the next series' first year when it has none. Without a year, every series
 * still maintained counts; undated series count only when no dated one does.
 */
export function seriesInCirculation(
  documents: CoverageDocument[],
  issueYear?: number,
): CoverageDocument[] {
  if (issueYear === undefined) {
    const current = documents.filter((d) => !d.deprecated)
    return current.length > 0 ? current : documents
  }
  const dated = documents
    .filter((d): d is CoverageDocument & { from: number } => d.from !== undefined)
    .sort((a, b) => a.from - b.from)
  const matches = dated.filter((d, i) => {
    const next = dated.slice(i + 1).find((later) => later.from > d.from)
    const last = d.to ?? (next ? next.from : Infinity)
    return d.from <= issueYear && issueYear <= last
  })
  if (matches.length > 0) return matches
  return documents.filter((d) => d.from === undefined)
}

/** Whether our verifiable certificates can have signed a document issued in the year */
function certificatesCover(country: CoverageCountry, issueYear?: number): boolean {
  const { supported, from } = country.chipCertificates
  if (!supported) return false
  return issueYear === undefined || from === null || issueYear >= from
}

export interface CoverageDocumentOption {
  type: CoverageDocumentType
  name: string
  shape: CoverageShape
  /** Whether any series of this type is listed as available */
  available: boolean
  /** Whether the type has series with and without a chip, so the issue year matters */
  mixedChip: boolean
}

/** The document types a country issues, for a picker */
export function listDocumentTypes(coverage: Coverage, country: string): CoverageDocumentOption[] {
  const entry = coverage.countries[country]
  if (!entry) return []
  return (Object.keys(coverage.documentTypes) as CoverageDocumentType[]).flatMap((type) => {
    const documents = entry.documents.filter((d) => d.type === type)
    if (documents.length === 0) return []
    const current = seriesInCirculation(documents)
    const chips = current.filter((d) => d.chip).length
    return [
      {
        type,
        name: coverage.documentTypes[type].name,
        shape: coverage.shapes[coverage.documentTypes[type].shape],
        available: documents.some((d) => d.available !== false),
        mixedChip: chips > 0 && chips < current.length,
      },
    ]
  })
}

export interface CoverageCountryOption {
  code: string
  name: string
}

/**
 * The countries in the table, by name. Only UN member and observer states unless asked
 * otherwise: the rest of the table are territories and bodies a user would not look for.
 */
export function listCountries(
  coverage: Coverage,
  { unStatesOnly = true }: { unStatesOnly?: boolean } = {},
): CoverageCountryOption[] {
  return Object.entries(coverage.countries)
    .filter(([code]) => !unStatesOnly || isUnState(code))
    .map(([code, { name }]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface IssueYearRange {
  /** The first year of the range; the issue year to decide with */
  from: number
  /** The last year, absent for the newest range */
  to?: number
  chip: boolean
}

/**
 * Ranges of issue years to choose from when a country has series with and without a chip:
 * consecutive series with the same chip answer make one range.
 */
export function issueYearRanges(
  coverage: Coverage,
  country: string,
  documentType: CoverageDocumentType,
): IssueYearRange[] {
  const documents = coverage.countries[country]?.documents ?? []
  const series = seriesInCirculation(documents.filter((d) => d.type === documentType))
  const byYear = new Map<number, boolean>()
  for (const document of series) {
    if (document.from === undefined) continue
    byYear.set(document.from, (byYear.get(document.from) ?? false) || document.chip)
  }
  const years = [...byYear.keys()].sort((a, b) => a - b)
  const ranges: IssueYearRange[] = []
  for (const year of years) {
    const chip = byYear.get(year)!
    const last = ranges[ranges.length - 1]
    if (last && last.chip === chip) continue
    if (last) last.to = year - 1
    ranges.push({ from: year, chip })
  }
  return ranges
}
