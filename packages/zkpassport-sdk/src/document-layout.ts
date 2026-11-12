import type { Query } from "@zkpassport/utils"

/**
 * Fields whose disclosed bytes sit at different offsets in a TD3 passport and a TD1 ID card.
 * `issuing_country` is left out: it is at the same offset in both.
 */
const LAYOUT_DEPENDENT_FIELDS = [
  "firstname",
  "lastname",
  "fullname",
  "birthdate",
  "expiry_date",
  "nationality",
  "gender",
  "document_number",
] as const

/**
 * Whether the query reads disclosed bytes whose meaning depends on the document layout.
 *
 * The disclosed bytes do not say whether they came from a passport or an ID card, and the
 * verifier cannot trust the prover to say so. The document-type character sits at index 0 in
 * both layouts, so disclosing it is what tells the verifier how to decode everything else.
 */
export function needsDocumentType(query: Query): boolean {
  return LAYOUT_DEPENDENT_FIELDS.some((field) => {
    const condition = query[field] as { disclose?: boolean; eq?: unknown } | undefined
    return !!condition && (condition.disclose === true || condition.eq !== undefined)
  })
}

/**
 * Return the query with `document_type` disclosed when it is needed to decode other disclosed
 * fields. Requests and verifications both go through this, so a query rebuilt on a backend
 * matches the one the app received without the integrator adding the field.
 */
export function withDocumentType(query: Query): Query {
  // An `eq` on the document type already puts its bytes in the disclosure
  if (
    !needsDocumentType(query) ||
    query.document_type?.disclose ||
    query.document_type?.eq !== undefined
  ) {
    return query
  }
  return { ...query, document_type: { ...query.document_type, disclose: true } }
}

/**
 * The layout of the disclosed bytes, read from the disclosed document-type character, or
 * undefined when it was not disclosed.
 */
export function getDisclosedLayout(disclosedBytes: number[]): "passport" | "id_card" | undefined {
  const first = disclosedBytes?.[0]
  if (!first) return undefined
  // ICAO 9303: "P" is a passport (TD3); "I", "A" and "C" are TD1 cards, and driving licences
  // are converted to a TD1 MRZ
  return String.fromCharCode(first) === "P" ? "passport" : "id_card"
}
