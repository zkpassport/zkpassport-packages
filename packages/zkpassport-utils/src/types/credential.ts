import type { IDCredentialValue, Query } from "./index"

/**
 * The assurance tier of a credential: 1 when its issuer signed the data, 2 when a device attested
 * a capture of it. The tier is the hundreds digit of the scheme.
 */
export enum CredentialTier {
  GOVERNMENT_SIGNED = 1,
  DEVICE_ATTESTED = 2,
}

/**
 * How an ID's data was verified: what the base proofs output, every disclosure proof carries as
 * its last public input, and the outer proof re-exports. One value per scheme, never reused.
 * Zero is never valid, so a proof made before the field existed can't pass as a real scheme.
 */
export enum CredentialScheme {
  /** The eMRTD chip, signed by the issuing country (CSCA -> DSC): passports and ICAO ID cards */
  ICAO_CHIP = 100,
  /** Aadhaar, signed by UIDAI */
  UIDAI_AADHAAR = 101,
  /** Japan's My Number card, JPKI chain */
  JPKI = 102,
  /** ISO 18013-5 mDoc (mDL, EUDI), IACA -> document signer */
  ISO_MDOC = 103,
  /** The data page read by camera on iOS, attested by App Attest with a strict face match */
  ATTESTED_CAPTURE_IOS = 200,
  /** The data page read by camera on Android, attested by Play Integrity with a strict face match */
  ATTESTED_CAPTURE_ANDROID = 201,
  /**
   * The chip read on iOS but its signature not verifiable (no certificate for it in the registry),
   * attested by App Attest with a strict face match. Reserved; no circuit proves it yet.
   */
  ATTESTED_CHIP_READ_IOS = 202,
  /** The same read on Android, attested by Play Integrity. Reserved; no circuit proves it yet. */
  ATTESTED_CHIP_READ_ANDROID = 203,
}

const SCHEMES_PER_TIER = 100

export type CredentialDocumentType = IDCredentialValue<"document_type">

const DOCUMENT_TYPES: CredentialDocumentType[] = [
  "passport",
  "id_card",
  "residence_permit",
  "other",
]

/**
 * An entry of a policy with limits: the tier or scheme it covers, and the IDs it covers under
 * it. `{ scheme: CredentialTier.DEVICE_ATTESTED, excludeCountries: ["ARE"] }` accepts a device
 * attested ID from anywhere but the UAE. The limits are proven, not just checked by the app:
 * they are added to the request's query for an ID verified under the entry, see
 * {@link applyCredentialPolicyToQuery}.
 */
export interface AllowedCredentialRule {
  scheme: CredentialTier | CredentialScheme
  /** Issuing countries, as alpha-3 codes, the entry does not cover */
  excludeCountries?: string[]
  /** The only issuing countries, as alpha-3 codes, the entry covers */
  includeCountries?: string[]
  /** The only document types the entry covers; the type is disclosed to prove it */
  documentTypes?: CredentialDocumentType[]
}

/**
 * An entry of a service's credential policy: a tier, which stands for every scheme of that tier,
 * one exact scheme, or either with limits. `[CredentialTier.GOVERNMENT_SIGNED,
 * CredentialScheme.ATTESTED_CAPTURE_IOS]` accepts any signed credential and a camera read
 * attested on iOS. A rule must not overlap another entry: one entry decides for each scheme.
 */
export type AllowedCredential = CredentialTier | CredentialScheme | AllowedCredentialRule

/** What a service accepts unless it says otherwise: signed credentials only */
export const DEFAULT_ALLOWED_CREDENTIALS: readonly AllowedCredential[] = [
  CredentialTier.GOVERNMENT_SIGNED,
]

/** The ID a policy is applied to, as far as it is known */
export interface CredentialSubject {
  /** Alpha-3 code of the issuing country */
  issuingCountry?: string | null
  documentType?: CredentialDocumentType | string | null
}

export function getTierForCredentialScheme(scheme: CredentialScheme): CredentialTier {
  return Math.floor(scheme / SCHEMES_PER_TIER) as CredentialTier
}

const isTier = (value: number): value is CredentialTier =>
  Object.values(CredentialTier).includes(value as CredentialTier)

const isScheme = (value: number): value is CredentialScheme =>
  Object.values(CredentialScheme).includes(value as CredentialScheme)

export function parseCredentialScheme(value: bigint | string | number): CredentialScheme {
  const scheme = Number(BigInt(value))
  if (!isScheme(scheme)) {
    throw new Error(`Unknown credential scheme: ${value}`)
  }
  return scheme
}

export function parseAllowedCredential(
  value: bigint | string | number,
): CredentialTier | CredentialScheme {
  const entry = Number(BigInt(value))
  if (!isTier(entry) && !isScheme(entry)) {
    throw new Error(`Unknown credential tier or scheme: ${value}`)
  }
  return entry
}

export const isAllowedCredentialRule = (entry: AllowedCredential): entry is AllowedCredentialRule =>
  typeof entry === "object" && entry !== null

/** The tier or scheme an entry stands for */
export function allowedCredentialScheme(
  entry: AllowedCredential,
): CredentialTier | CredentialScheme {
  return isAllowedCredentialRule(entry) ? entry.scheme : entry
}

const covers = (entry: AllowedCredential, scheme: CredentialScheme): boolean => {
  const number = allowedCredentialScheme(entry)
  return number === scheme || number === getTierForCredentialScheme(scheme)
}

const isAlpha3 = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Z]{3}$/.test(value)

/** Checks a rule's shape; the countries are alpha-3 codes, the document types known ones */
export function parseAllowedCredentialRule(value: unknown): AllowedCredentialRule {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Not a credential rule: ${JSON.stringify(value)}`)
  }
  const raw = value as Record<string, unknown>
  const rule: AllowedCredentialRule = { scheme: parseAllowedCredential(raw.scheme as number) }
  for (const key of ["excludeCountries", "includeCountries"] as const) {
    if (raw[key] === undefined) continue
    const countries = raw[key]
    if (!Array.isArray(countries) || countries.length === 0 || !countries.every(isAlpha3)) {
      throw new Error(`${key} must be a list of alpha-3 country codes`)
    }
    rule[key] = [...new Set(countries as string[])].sort()
  }
  if (rule.excludeCountries && rule.includeCountries) {
    throw new Error("A credential rule excludes countries or includes them, not both")
  }
  if (raw.documentTypes !== undefined) {
    const types = raw.documentTypes
    if (
      !Array.isArray(types) ||
      types.length === 0 ||
      !types.every((type) => DOCUMENT_TYPES.includes(type as CredentialDocumentType))
    ) {
      throw new Error(`documentTypes must be a list of ${DOCUMENT_TYPES.join(", ")}`)
    }
    rule.documentTypes = [...new Set(types as CredentialDocumentType[])]
  }
  if (!rule.excludeCountries && !rule.includeCountries && !rule.documentTypes) {
    throw new Error("A credential rule needs at least one limit")
  }
  return rule
}

/**
 * Checks every entry and that no rule overlaps another entry: a rule on a tier and an entry on
 * a scheme of that tier would leave two answers for that scheme.
 */
export function validateAllowedCredentials(allowed: readonly AllowedCredential[]): void {
  const entries = allowed.map((entry) =>
    isAllowedCredentialRule(entry)
      ? parseAllowedCredentialRule(entry)
      : parseAllowedCredential(entry),
  )
  entries.forEach((entry, i) => {
    if (!isAllowedCredentialRule(entry)) return
    const overlaps = entries.some((other, j) => {
      if (i === j) return false
      const a = entry.scheme
      const b = allowedCredentialScheme(other)
      return (
        a === b ||
        (isTier(a) && !isTier(b) && getTierForCredentialScheme(b) === a) ||
        (isTier(b) && !isTier(a) && getTierForCredentialScheme(a) === b)
      )
    })
    if (overlaps) {
      throw new Error(`Credential rule for ${entry.scheme} overlaps another entry of the policy`)
    }
  })
}

const withinRule = (rule: AllowedCredentialRule, subject: CredentialSubject): boolean => {
  const { issuingCountry, documentType } = subject
  if (issuingCountry && rule.excludeCountries?.includes(issuingCountry)) return false
  if (issuingCountry && rule.includeCountries && !rule.includeCountries.includes(issuingCountry)) {
    return false
  }
  if (
    documentType &&
    rule.documentTypes &&
    !rule.documentTypes.includes(documentType as CredentialDocumentType)
  ) {
    return false
  }
  return true
}

/**
 * Whether the policy accepts a scheme; no policy means the default one. With the ID's country
 * or document type known, a rule's limits count too; what is not known is not held against it,
 * since the limits are proven separately.
 */
export function isCredentialAllowed(
  scheme: CredentialScheme,
  allowed: readonly AllowedCredential[] = DEFAULT_ALLOWED_CREDENTIALS,
  subject: CredentialSubject = {},
): boolean {
  return allowed.some(
    (entry) =>
      covers(entry, scheme) && (!isAllowedCredentialRule(entry) || withinRule(entry, subject)),
  )
}

/** The rule of the policy that covers a scheme, if the entry covering it is one */
export function credentialRuleFor(
  scheme: CredentialScheme,
  allowed: readonly AllowedCredential[] = DEFAULT_ALLOWED_CREDENTIALS,
): AllowedCredentialRule | undefined {
  return allowed.find(
    (entry): entry is AllowedCredentialRule =>
      isAllowedCredentialRule(entry) && covers(entry, scheme),
  )
}

/**
 * The query to prove for an ID verified under a scheme: the request's own, plus what the policy's
 * rule for that scheme requires. Excluded countries join the issuing country exclusion, included
 * countries narrow (or set) the inclusion, and a document type limit discloses the type. The app
 * proves this query and the verifier checks against it, so the limits hold without trusting the
 * app.
 */
export function applyCredentialPolicyToQuery(
  query: Query,
  scheme: CredentialScheme,
  allowed: readonly AllowedCredential[] | null | undefined,
): Query {
  const rule = credentialRuleFor(scheme, allowed ?? DEFAULT_ALLOWED_CREDENTIALS)
  if (!rule) return query
  const result: Query = { ...query }
  if (rule.excludeCountries) {
    const out = [...new Set([...(query.issuing_country?.out ?? []), ...rule.excludeCountries])]
    result.issuing_country = { ...query.issuing_country, out: out.sort() }
  }
  if (rule.includeCountries) {
    const existing = query.issuing_country?.in
    const within = existing
      ? rule.includeCountries.filter((country) => existing.includes(country))
      : rule.includeCountries
    result.issuing_country = { ...result.issuing_country, in: [...within].sort() }
  }
  if (rule.documentTypes) {
    result.document_type = { ...query.document_type, disclose: true }
  }
  return result
}

/** Every scheme a policy accepts for some ID, with tiers expanded and rule limits set aside */
export function expandAllowedCredentials(
  allowed: readonly AllowedCredential[] = DEFAULT_ALLOWED_CREDENTIALS,
): CredentialScheme[] {
  const schemes = Object.values(CredentialScheme).filter(
    (value): value is CredentialScheme => typeof value === "number",
  )
  return schemes.filter((scheme) => isCredentialAllowed(scheme, allowed))
}

/** The tiers and schemes of the policy as they travel in a request URL, e.g. "1,201" */
export function serializeAllowedCredentials(allowed: readonly AllowedCredential[]): string {
  return allowed.map((entry) => parseAllowedCredential(allowedCredentialScheme(entry))).join(",")
}

/** The rules of the policy as they travel beside the tiers and schemes, or nothing without rules */
export function serializeCredentialRules(
  allowed: readonly AllowedCredential[],
): string | undefined {
  const rules = allowed.filter(isAllowedCredentialRule)
  return rules.length > 0 ? JSON.stringify(rules) : undefined
}

export function parseCredentialRules(value: string | null | undefined): AllowedCredentialRule[] {
  if (value == null || value === "") return []
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error("Credential rules must be a list")
  return parsed.map(parseAllowedCredentialRule)
}

/**
 * The policy from its two parts: the tiers and schemes, and the rules, which take the place of
 * their tier or scheme in the list.
 */
export function parseAllowedCredentials(
  value: string | null | undefined,
  rules?: string | null,
): AllowedCredential[] | null {
  if (value == null || value === "") return null
  const parsedRules = parseCredentialRules(rules)
  const entries: AllowedCredential[] = value.split(",").map((entry) => {
    const number = parseAllowedCredential(entry.trim())
    return parsedRules.find((rule) => rule.scheme === number) ?? number
  })
  validateAllowedCredentials(entries)
  return entries
}
