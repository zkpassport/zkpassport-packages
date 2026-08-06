import type { IDCredential, Query } from "@zkpassport/sdk"

/** Render a query as human-readable items for the intro screen. */

export type QueryDescriptionItem = {
  title: string
  detail?: string
}

const FIELD_LABELS: Partial<Record<IDCredential, string>> = {
  firstname: "first name",
  lastname: "last name",
  fullname: "full name",
  birthdate: "date of birth",
  age: "age",
  expiry_date: "ID expiry date",
  nationality: "nationality",
  issuing_country: "ID issuing country",
  document_number: "document number",
  document_type: "document type",
  gender: "gender",
}

const DATE_FIELDS: IDCredential[] = ["birthdate", "expiry_date"]

const DISCLOSE_DETAIL = "Read from your ID chip, nothing else is shared"

function formatValue(field: IDCredential, value: unknown): string {
  if (value instanceof Date) return value.toLocaleDateString()
  if (DATE_FIELDS.includes(field) && (typeof value === "string" || typeof value === "number")) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString()
  }
  if (field === "document_type" && typeof value === "string") {
    return value.replace(/_/g, " ")
  }
  return String(value)
}

function formatList(field: IDCredential, values: unknown[]): string {
  const shown = values.slice(0, 3).map((value) => formatValue(field, value))
  const rest = values.length - shown.length
  return shown.join(", ") + (rest > 0 ? ` and ${rest} more` : "")
}

function label(field: IDCredential): string {
  return FIELD_LABELS[field] ?? String(field).replace(/_/g, " ")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeField(field: IDCredential, conditions: any, items: QueryDescriptionItem[]): void {
  const fieldLabel = label(field)
  if (field === "age") {
    const detail = "Your exact age and birthdate stay hidden"
    if (conditions.gte != null) items.push({ title: `You are ${conditions.gte} or older`, detail })
    if (conditions.gt != null) items.push({ title: `You are over ${conditions.gt}`, detail })
    if (conditions.lte != null)
      items.push({ title: `You are ${conditions.lte} or younger`, detail })
    if (conditions.lt != null) items.push({ title: `You are under ${conditions.lt}`, detail })
    if (conditions.range != null)
      items.push({
        title: `Your age is between ${conditions.range[0]} and ${conditions.range[1]}`,
        detail,
      })
    if (conditions.eq != null)
      items.push({
        title: `You are ${conditions.eq} years old`,
        detail: "Your birthdate stays hidden",
      })
    if (conditions.disclose) items.push({ title: "Share your age", detail: DISCLOSE_DETAIL })
    return
  }
  if (field === "expiry_date") {
    const detail = "Your exact expiry date stays hidden"
    if (conditions.gte != null || conditions.gt != null)
      items.push({
        title: `Your ID is valid until at least ${formatValue(field, conditions.gte ?? conditions.gt)}`,
        detail,
      })
    if (conditions.lte != null || conditions.lt != null)
      items.push({
        title: `Your ID expires before ${formatValue(field, conditions.lte ?? conditions.lt)}`,
        detail,
      })
    if (conditions.range != null)
      items.push({
        title: `Your ID expires between ${formatValue(field, conditions.range[0])} and ${formatValue(field, conditions.range[1])}`,
        detail,
      })
    if (conditions.eq != null)
      items.push({ title: `Your ID expires on ${formatValue(field, conditions.eq)}` })
    if (conditions.disclose)
      items.push({ title: "Share your ID expiry date", detail: DISCLOSE_DETAIL })
    return
  }
  if (field === "birthdate") {
    const detail = "Your exact birthdate stays hidden"
    if (conditions.gte != null || conditions.gt != null)
      items.push({
        title: `You were born after ${formatValue(field, conditions.gte ?? conditions.gt)}`,
        detail,
      })
    if (conditions.lte != null || conditions.lt != null)
      items.push({
        title: `You were born before ${formatValue(field, conditions.lte ?? conditions.lt)}`,
        detail,
      })
    if (conditions.range != null)
      items.push({
        title: `You were born between ${formatValue(field, conditions.range[0])} and ${formatValue(field, conditions.range[1])}`,
        detail,
      })
    if (conditions.eq != null)
      items.push({ title: `Your date of birth is ${formatValue(field, conditions.eq)}` })
    if (conditions.disclose)
      items.push({ title: "Share your date of birth", detail: DISCLOSE_DETAIL })
    return
  }
  // Generic string-ish fields
  if (conditions.eq != null)
    items.push({
      title: `Your ${fieldLabel} is ${formatValue(field, conditions.eq)}`,
      detail: "Only whether it matches is shared",
    })
  if (conditions.in != null)
    items.push({
      title: `Your ${fieldLabel} is one of: ${formatList(field, conditions.in)}`,
      detail: `Your actual ${fieldLabel} stays hidden`,
    })
  if (conditions.out != null)
    items.push({
      title: `Your ${fieldLabel} is not one of: ${formatList(field, conditions.out)}`,
      detail: `Your actual ${fieldLabel} stays hidden`,
    })
  if (conditions.disclose)
    items.push({ title: `Share your ${fieldLabel}`, detail: DISCLOSE_DETAIL })
}

export function describeQuery(query: Query | null | undefined): QueryDescriptionItem[] {
  if (!query) return []
  const items: QueryDescriptionItem[] = []
  for (const [field, conditions] of Object.entries(query)) {
    if (conditions == null) continue
    if (field === "sanctions") {
      items.push({
        title: "You are not on international sanctions lists",
        detail: "Checked without revealing who you are",
      })
      continue
    }
    if (field === "facematch") {
      items.push({
        title: "Your face matches your ID photo",
        detail: "Selfie compared on your device, never uploaded",
      })
      continue
    }
    if (field === "bind") {
      items.push({ title: "Attach the provided data to this verification" })
      continue
    }
    describeField(field as IDCredential, conditions, items)
  }
  if (items.length === 0) {
    items.push({
      title: "You hold a valid, unexpired passport or ID card",
      detail: "Nothing else about you is revealed",
    })
  }
  return items
}
