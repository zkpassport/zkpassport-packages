import { countryCodeAlpha3ToAlpha2, type IDCredentialConfig, type Query } from "@zkpassport/utils"
import type { CredentialPolicyRequirements } from "./index"

/** A check of an SDK query that a credential policy cannot carry, e.g. `issuing_country` `in`. */
type UnsupportedQueryCheck = {
  field: string
  method: string
}

const CARRIED_FIELDS = new Set(["age", "nationality", "sanctions", "facematch"])

/**
 * Translate an SDK query into credential policy requirements, or list the checks that no
 * credential policy can carry. Accepted verification methods are not part of a query, so the
 * requirements leave them unset.
 */
export function credentialRequirementsFromQuery(
  query: Query,
): { requirements: CredentialPolicyRequirements } | { unsupported: UnsupportedQueryCheck[] } {
  const unsupported: UnsupportedQueryCheck[] = []
  const requirements: CredentialPolicyRequirements = {
    minAge: 0,
    includedNationalities: [],
    excludedNationalities: [],
  }

  for (const [method, value] of definedEntries(query.age)) {
    if (method === "gte" && isUint8(value)) {
      requirements.minAge = value
    } else {
      unsupported.push({ field: "age", method })
    }
  }

  const included = new Set<string>()
  const excluded = new Set<string>()
  for (const [method, value] of definedEntries(query.nationality)) {
    const countries = method === "eq" ? [value] : value
    const target =
      method === "out" ? excluded : method === "in" || method === "eq" ? included : null
    if (!target || !Array.isArray(countries) || !countries.every(isAlpha3Code)) {
      unsupported.push({ field: "nationality", method })
      continue
    }
    countries.forEach((country) => target.add(country))
  }
  requirements.includedNationalities = [...included].sort()
  requirements.excludedNationalities = [...excluded].sort()

  if (query.sanctions) {
    requirements.sanctionsMode = query.sanctions.strict ? "strict" : "normal"
  }

  if (query.facematch) {
    if (query.facematch.mode === "strict" || query.facematch.mode === "regular") {
      requirements.facematchMode = query.facematch.mode
    } else {
      unsupported.push({ field: "facematch", method: "mode" })
    }
  }

  for (const [field, config] of Object.entries(query)) {
    if (CARRIED_FIELDS.has(field) || config === undefined) {
      continue
    }
    const methods = typeof config === "object" && config !== null ? Object.keys(config) : [""]
    unsupported.push(...methods.map((method) => ({ field, method })))
  }

  return unsupported.length > 0 ? { unsupported } : { requirements }
}

/**
 * Translate credential policy requirements into the SDK query that checks the same things, the
 * inverse of `credentialRequirementsFromQuery`. Accepted verification methods are not part of a
 * query, so they are left out.
 */
export function credentialQueryFromRequirements(requirements: CredentialPolicyRequirements): Query {
  const query: Query = {}

  if (requirements.minAge > 0) {
    query.age = { gte: requirements.minAge }
  }

  const nationality: IDCredentialConfig = {}
  if (requirements.includedNationalities.length > 0) {
    nationality.in = [...requirements.includedNationalities]
  }
  if (requirements.excludedNationalities.length > 0) {
    nationality.out = [...requirements.excludedNationalities]
  }
  if (Object.keys(nationality).length > 0) {
    query.nationality = nationality
  }

  if (requirements.sanctionsMode) {
    query.sanctions = {
      countries: "all",
      lists: "all",
      strict: requirements.sanctionsMode === "strict",
    }
  }

  if (requirements.facematchMode) {
    query.facematch = { mode: requirements.facematchMode }
  }

  return query
}

function definedEntries(config: IDCredentialConfig | undefined): [string, unknown][] {
  return Object.entries(config ?? {}).filter(([, value]) => value !== undefined)
}

function isUint8(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255
}

function isAlpha3Code(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Z]{3}$/.test(value) &&
    countryCodeAlpha3ToAlpha2(value) !== undefined
  )
}
