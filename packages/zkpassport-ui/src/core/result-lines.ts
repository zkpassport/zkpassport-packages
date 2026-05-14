/**
 * Format a verified `QueryResult` into human-readable lines for the success
 * panel. The result shape is duck-typed — we deliberately don't import from
 * `@zkpassport/sdk` or `@zkpassport/utils` so this package stays decoupled and
 * versions can evolve independently.
 *
 * Returns a non-empty list. If the result has no recognized gates / disclosures
 * (e.g. an empty query was passed through), falls back to a single generic line
 * so the panel never renders an empty list.
 */
export function describeVerifiedAttributes(result: unknown): string[] {
  const lines: string[] = []

  const ageGte = pick(result, "age", "gte")
  if (truthy(ageGte, "result")) lines.push(`Verified age ≥ ${stringify(pick(ageGte, "expected"))}`)

  if (truthy(pick(result, "sanctions"), "passed")) lines.push("Not on any sanctions list")
  // The SDK has shipped two facematch result shapes over time; check both so
  // older fixtures still format correctly.
  if (
    truthy(pick(result, "facematch"), "passed") ||
    truthy(pick(result, "facematch", "facematch"), "result")
  ) {
    lines.push("FaceMatch confirmed")
  }

  if (truthy(pick(result, "nationality", "in"), "result")) lines.push("Nationality on allowlist")
  if (truthy(pick(result, "nationality", "out"), "result"))
    lines.push("Nationality not on blocklist")

  const docTypeEq = pick(result, "document_type", "eq")
  if (truthy(docTypeEq, "result")) {
    lines.push(`Document type: ${stringify(pick(docTypeEq, "expected"))}`)
  }

  if (truthy(pick(result, "issuing_country", "in"), "result"))
    lines.push("Issuing country on allowlist")
  if (truthy(pick(result, "issuing_country", "out"), "result"))
    lines.push("Issuing country not on blocklist")

  const expiry = pick(result, "expiry_date", "gte")
  if (truthy(expiry, "result")) {
    lines.push(`Document expires on/after ${stringify(pick(expiry, "expected"))}`)
  }

  for (const [key, label] of DISCLOSE_LABELS) {
    const value = pick(result, key, "disclose", "result")
    if (value !== undefined && value !== null && value !== "") {
      lines.push(`${label}: ${stringify(value)}`)
    }
  }

  return lines.length > 0 ? lines : ["All requested attributes verified"]
}

const DISCLOSE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["firstname", "First name"],
  ["lastname", "Last name"],
  ["fullname", "Full name"],
  ["nationality", "Nationality"],
  ["gender", "Gender"],
  ["birthdate", "Date of birth"],
  ["document_number", "Document number"],
  ["issuing_country", "Issuing country"],
  ["expiry_date", "Expires"],
]

/**
 * Walk a nested unknown via string keys, returning undefined the moment any
 * intermediate value isn't a record. Lets us read the dynamic QueryResult
 * tree without leaking `any` or importing typed shapes from the SDK.
 */
function pick(value: unknown, ...keys: ReadonlyArray<string>): unknown {
  let current = value
  for (const key of keys) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function truthy(value: unknown, key: string): boolean {
  return Boolean(pick(value, key))
}

function stringify(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "string") return value
  return String(value)
}
