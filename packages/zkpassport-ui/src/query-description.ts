import type { BoundData, IDCredential, Query } from "@zkpassport/sdk"

/**
 * Render a query as human-readable items for the intro screen.
 */

export type QueryDescriptionItem = {
  title: string
  detail?: string
  note?: string
  rows?: Array<{ label: string; value: string }>
}

const FIELD_LABELS: Partial<Record<IDCredential, string>> = {
  firstname: "first name",
  lastname: "last name",
  fullname: "full name",
  birthdate: "date of birth",
  age: "age",
  expiry_date: "ID expiry date",
  nationality: "nationality",
  issuing_country: "issuing country",
  document_number: "document number",
  document_type: "document type",
  gender: "gender",
}

const DATE_FIELDS: IDCredential[] = ["birthdate", "expiry_date"]
const COUNTRY_FIELDS: IDCredential[] = ["nationality", "issuing_country"]

const DISCLOSE_ORDER: IDCredential[] = [
  "firstname",
  "lastname",
  "fullname",
  "gender",
  "birthdate",
  "age",
  "document_type",
  "document_number",
  "nationality",
  "issuing_country",
  "expiry_date",
]

// Reading order on the card
const GROUP = {
  disclose: 0,
  age: 1,
  date: 2,
  country: 3,
  field: 4,
  sanctions: 5,
  facematch: 6,
  bind: 7,
} as const

type Entry = QueryDescriptionItem & { group: number; order?: number }

// Above this, a list moves out of the title and into the detail line
const INLINE_LIST_MAX = 3

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, DATE_FORMAT)
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  passport: "passport",
  id_card: "ID card",
  residence_permit: "residence permit",
}

// "Your ID is a passport" needs the article the raw value doesn't carry
const DOCUMENT_TYPE_PHRASES: Record<string, string> = {
  passport: "a passport",
  id_card: "an ID card",
  residence_permit: "a residence permit",
  other: "another accepted document",
}

function formatValue(field: IDCredential, value: unknown): string {
  if (value instanceof Date) return formatDate(value)
  if (DATE_FIELDS.includes(field) && (typeof value === "string" || typeof value === "number")) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return formatDate(date)
  }
  if (field === "document_type" && typeof value === "string") {
    return DOCUMENT_TYPE_LABELS[value] ?? value.replace(/_/g, " ")
  }
  return String(value)
}

function joinNatural(parts: string[], conjunction: string): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} ${conjunction} ${parts[parts.length - 1]}`
}

function label(field: IDCredential): string {
  return FIELD_LABELS[field] ?? String(field).replace(/_/g, " ")
}

// Short lists read better inline; long ones become a count plus the full set on
// the detail line, so nothing is hidden behind "and N more"
function describeSet(field: IDCredential, values: unknown[], excluded: boolean): Entry {
  const fieldLabel = label(field)
  const formatted = values
    .map((value) => formatValue(field, value))
    .sort((a, b) => a.localeCompare(b))
  const group = COUNTRY_FIELDS.includes(field) ? GROUP.country : GROUP.field
  if (formatted.length <= INLINE_LIST_MAX) {
    const phrase = excluded
      ? formatted.length === 1
        ? `is not ${formatted[0]}`
        : `is not any of ${formatted.join(", ")}`
      : `is ${joinNatural(formatted, "or")}`
    return { title: `Your ${fieldLabel} ${phrase}`, group }
  }
  const unit = COUNTRY_FIELDS.includes(field) ? "countries" : "values"
  const verb = excluded ? "is not any of" : "is one of"
  return {
    title: `Your ${fieldLabel} ${verb} these ${formatted.length} ${unit}:`,
    detail: formatted.join(", "),
    group,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeField(field: IDCredential, conditions: any, entries: Entry[]): void {
  const fieldLabel = label(field)
  if (field === "age") {
    const group = GROUP.age
    if (conditions.gte != null) entries.push({ title: `You are ${conditions.gte} or older`, group })
    if (conditions.gt != null) entries.push({ title: `You are over ${conditions.gt}`, group })
    if (conditions.lte != null)
      entries.push({ title: `You are ${conditions.lte} or younger`, group })
    if (conditions.lt != null) entries.push({ title: `You are under ${conditions.lt}`, group })
    if (conditions.range != null)
      entries.push({
        title: `Your age is between ${conditions.range[0]} and ${conditions.range[1]}`,
        group,
      })
    if (conditions.eq != null) entries.push({ title: `You are ${conditions.eq} years old`, group })
    return
  }
  if (field === "expiry_date") {
    const group = GROUP.date
    if (conditions.gte != null || conditions.gt != null)
      entries.push({
        title: `Your ID is valid until at least ${formatValue(field, conditions.gte ?? conditions.gt)}`,
        group,
      })
    if (conditions.lte != null || conditions.lt != null)
      entries.push({
        title: `Your ID expires before ${formatValue(field, conditions.lte ?? conditions.lt)}`,
        group,
      })
    if (conditions.range != null)
      entries.push({
        title: `Your ID expires between ${formatValue(field, conditions.range[0])} and ${formatValue(field, conditions.range[1])}`,
        group,
      })
    if (conditions.eq != null)
      entries.push({ title: `Your ID expires on ${formatValue(field, conditions.eq)}`, group })
    return
  }
  if (field === "birthdate") {
    const group = GROUP.date
    if (conditions.gte != null || conditions.gt != null)
      entries.push({
        title: `You were born after ${formatValue(field, conditions.gte ?? conditions.gt)}`,
        group,
      })
    if (conditions.lte != null || conditions.lt != null)
      entries.push({
        title: `You were born before ${formatValue(field, conditions.lte ?? conditions.lt)}`,
        group,
      })
    if (conditions.range != null)
      entries.push({
        title: `You were born between ${formatValue(field, conditions.range[0])} and ${formatValue(field, conditions.range[1])}`,
        group,
      })
    if (conditions.eq != null)
      entries.push({ title: `Your date of birth is ${formatValue(field, conditions.eq)}`, group })
    return
  }
  // Generic string-ish fields
  if (conditions.eq != null)
    entries.push({
      title:
        field === "document_type"
          ? `Your ID is ${DOCUMENT_TYPE_PHRASES[String(conditions.eq)] ?? formatValue(field, conditions.eq)}`
          : `Your ${fieldLabel} is ${formatValue(field, conditions.eq)}`,
      group: GROUP.field,
    })
  if (conditions.in != null) entries.push(describeSet(field, conditions.in, false))
  if (conditions.out != null) entries.push(describeSet(field, conditions.out, true))
}

// "base" -> "Base", "world_chain" -> "World Chain"
function chainLabel(chain: string): string {
  return chain
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/**
 * Binding names what the proof is locked to, so it cannot be replayed elsewhere.
 * The wallet and chain are known values worth naming; anything else is opaque
 * data the site chose, so it is shown as-is rather than described.
 */
function describeBinding(bound: BoundData): QueryDescriptionItem {
  const { user_address: wallet, chain, custom_data: custom } = bound
  const note = "Bound to"
  const rows: Array<{ label: string; value: string }> = []
  if (chain) rows.push({ label: "Chain", value: chainLabel(chain) })
  if (wallet) rows.push({ label: "Wallet", value: wallet })

  if (custom !== undefined && custom !== null) {
    // Opaque to us, so it is shown exactly as the site supplied it
    const value = typeof custom === "string" ? custom : JSON.stringify(custom)
    if (rows.length === 0) return { note, title: value }
    rows.push({ label: "Data", value })
  }

  if (rows.length === 0) return { note, title: "This site" }
  return { note, title: "", rows }
}

// One row per disclosed field, ordered by DISCLOSE_ORDER. A disclosed full name
// subsumes the parts, so the parts don't get a row of their own.
function describeDisclosures(fields: IDCredential[]): Entry[] {
  const rank = (field: IDCredential) => {
    const index = DISCLOSE_ORDER.indexOf(field)
    return index === -1 ? DISCLOSE_ORDER.length : index
  }
  const named = fields.includes("fullname")
    ? fields.filter((field) => field !== "firstname" && field !== "lastname")
    : fields
  return named.map((field) => ({
    title: `Share your ${label(field)}`,
    group: GROUP.disclose,
    order: rank(field),
  }))
}

export function describeQuery(query: Query | null | undefined): QueryDescriptionItem[] {
  if (!query) return []
  const entries: Entry[] = []
  const disclosed: IDCredential[] = []

  for (const [field, conditions] of Object.entries(query)) {
    if (conditions == null) continue
    if (field === "sanctions") {
      entries.push({ title: "You are not on any sanctions list", group: GROUP.sanctions })
      continue
    }
    if (field === "facematch") {
      entries.push({ title: "Your face matches your ID photo", group: GROUP.facematch })
      continue
    }
    if (field === "bind") {
      entries.push({ ...describeBinding(conditions as BoundData), group: GROUP.bind })
      continue
    }
    // `policy` is an id, not a credential condition
    if (field === "policy") continue
    const credential = field as IDCredential
    if ((conditions as { disclose?: boolean }).disclose) disclosed.push(credential)
    describeField(credential, conditions, entries)
  }

  entries.push(...describeDisclosures(disclosed))

  if (entries.length === 0) {
    return [{ title: "You hold a valid, unexpired passport or ID card" }]
  }

  // Stable within a group, so conditions on one field keep their order
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        a.entry.group - b.entry.group ||
        (a.entry.order ?? 0) - (b.entry.order ?? 0) ||
        a.index - b.index,
    )
    .map(({ entry: { group: _group, order: _order, ...item } }) => item)
}
