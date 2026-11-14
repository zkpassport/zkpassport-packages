/**
 * A TD1 MRZ (3 x 30 characters, ICAO 9303 Part 5) built from a document's fields, for IDs read by
 * camera without a machine-readable zone of their own: a US or Canadian driving licence from its
 * barcode, or a national ID from its printed text. The circuits then read it as they read an ID
 * card's MRZ, and the Tier 2 nullifier takes its country, whole number, birth date and expiry.
 *
 * The rules that fill in what a document doesn't print (a lifetime ID's expiry, a date with only
 * its year) feed the nullifier, so they must never change.
 */
import { MRZ_FILLER } from "./mrz"

const TD1_LINE_LENGTH = 30
const PRINCIPAL_NUMBER_LENGTH = 9
const OPTIONAL_DATA_LENGTH = 15

/**
 * The expiry date a document valid for life is given: fixed, so its nullifier never changes. The
 * MRZ keeps two digits of the year, and the circuits and apps read a year above (this year + 30)
 * as 19YY, so it must stay inside that window: "55" reads as 2055 from 2025 on, while "99" would
 * read as 1999 and the card as expired. Lifetime cards stop proving after 2055, long before which
 * the circuits should mark a lifetime expiry explicitly.
 */
export const LIFETIME_EXPIRY_DATE = "2055-12-31"

export class Td1MrzError extends Error {}

export interface Td1Fields {
  /** Two characters: "ID" for a national ID card, "DL" for a driving licence */
  documentCode: string
  /** ISO 3166-1 alpha-3 */
  issuingCountry: string
  /** ISO 3166-1 alpha-3, or "" when the document proves none */
  nationality: string
  /** Upper case letters and digits */
  number: string
  /**
   * Written after the number's check digit and a filler, in the optional data (a licence's state,
   * so two states issuing the same number never share a nullifier). Forces the overflow form.
   */
  numberSuffix?: string
  surname: string
  givenNames: string
  /** YYYY-MM-DD */
  dateOfBirth: string
  /** YYYY-MM-DD */
  dateOfExpiry: string
  sex: "M" | "F" | "X" | ""
}

const CHECK_DIGIT_WEIGHTS = [7, 3, 1]

/** ICAO 9303 Part 3 check digit: digits as themselves, A-Z as 10-35, the filler as 0 */
export function mrzCheckDigit(value: string): string {
  let sum = 0
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    const code =
      char >= "0" && char <= "9"
        ? Number(char)
        : char >= "A" && char <= "Z"
          ? char.charCodeAt(0) - 55
          : 0
    sum += code * CHECK_DIGIT_WEIGHTS[i % 3]
  }
  return String(sum % 10)
}

/** Latin letters only, accents dropped; anything else separates name parts */
export function nameToMrz(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]+/g, MRZ_FILLER)
    .replace(/^<+|<+$/g, "")
}

const fit = (value: string, length: number) => value.slice(0, length).padEnd(length, MRZ_FILLER)

const mrzDate = (isoDate: string) =>
  isoDate.slice(2, 4) + isoDate.slice(5, 7) + isoDate.slice(8, 10)

const COUNTRY = /^[A-Z]{3}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The number area of line 1 (positions 6-30): a number of up to 9 characters fills the document
 * number field with its check digit after it; a longer one, or one with a suffix, takes the
 * overflow form (ICAO 9303 Part 5, note j): its first 9 characters, a filler in the check digit's
 * place, then the rest of the number and its check digit in the optional data, then the suffix.
 */
function numberArea(number: string, suffix: string | undefined): string {
  if (!suffix && number.length <= PRINCIPAL_NUMBER_LENGTH) {
    return `${fit(number, PRINCIPAL_NUMBER_LENGTH)}${mrzCheckDigit(number)}${fit("", OPTIONAL_DATA_LENGTH)}`
  }
  const optional = `${number.slice(PRINCIPAL_NUMBER_LENGTH)}${mrzCheckDigit(number)}${suffix ? `${MRZ_FILLER}${suffix}` : ""}`
  if (optional.length > OPTIONAL_DATA_LENGTH) {
    throw new Td1MrzError("The document number is too long for a TD1 MRZ")
  }
  return `${fit(number.slice(0, PRINCIPAL_NUMBER_LENGTH), PRINCIPAL_NUMBER_LENGTH)}${MRZ_FILLER}${fit(optional, OPTIONAL_DATA_LENGTH)}`
}

/** The TD1 MRZ (3 x 30, no separators) for a document's fields */
export function fieldsToTd1Mrz(fields: Td1Fields): string {
  if (!/^[A-Z][A-Z<]$/.test(fields.documentCode)) {
    throw new Td1MrzError(`Invalid document code ${fields.documentCode}`)
  }
  if (!COUNTRY.test(fields.issuingCountry)) {
    throw new Td1MrzError(`Invalid issuing country ${fields.issuingCountry}`)
  }
  if (fields.nationality && !COUNTRY.test(fields.nationality)) {
    throw new Td1MrzError(`Invalid nationality ${fields.nationality}`)
  }
  if (!/^[A-Z0-9]+$/.test(fields.number)) {
    throw new Td1MrzError("The document number must be letters and digits")
  }
  if (!ISO_DATE.test(fields.dateOfBirth) || !ISO_DATE.test(fields.dateOfExpiry)) {
    throw new Td1MrzError("Dates must be YYYY-MM-DD")
  }
  const line1 = `${fields.documentCode}${fields.issuingCountry}${numberArea(fields.number, fields.numberSuffix)}`

  const birth = mrzDate(fields.dateOfBirth)
  // An expiry past the lifetime date is written as it, like a lifetime card's: the circuits read a
  // two-digit year beyond this year + 30 as 19YY, so a licence valid to 65 would read as expired.
  // Fixed, so the nullifier doesn't move with the reading year
  const expiry = mrzDate(
    fields.dateOfExpiry > LIFETIME_EXPIRY_DATE ? LIFETIME_EXPIRY_DATE : fields.dateOfExpiry,
  )
  const sex = fields.sex === "M" || fields.sex === "F" ? fields.sex : MRZ_FILLER
  const line2Start = `${birth}${mrzCheckDigit(birth)}${sex}${expiry}${mrzCheckDigit(expiry)}`
  const line2Body = `${line2Start}${fit(fields.nationality, 3)}${fit("", 11)}`
  // Composite: line 1 from the number on, and line 2's dates with their check digits
  const composite = mrzCheckDigit(
    line1.slice(5) + line2Body.slice(0, 7) + line2Body.slice(8, 15) + line2Body.slice(18, 29),
  )
  const line2 = `${line2Body}${composite}`

  const surname = nameToMrz(fields.surname)
  const given = nameToMrz(fields.givenNames)
  if (!surname && !given) throw new Td1MrzError("The document has no Latin name")
  const line3 = fit(given ? `${surname}<<${given}` : surname, TD1_LINE_LENGTH)

  const mrz = `${line1}${line2}${line3}`
  if (mrz.length !== 3 * TD1_LINE_LENGTH) {
    throw new Td1MrzError("The document does not fit a TD1 MRZ")
  }
  return mrz
}

/**
 * A date as a document prints it, completed by fixed rules when part of it is missing:
 * - an expiry printed as lifetime ("lifetime: true") becomes LIFETIME_EXPIRY_DATE
 * - a year alone becomes 1 January for an expiry (the document is treated as expired early, never
 *   late) and 31 December for a birth date (the holder is treated as younger, never older, so a
 *   minimum age check can't pass early)
 * - a year and month become the month's first day for an expiry and its last for a birth date
 * Returns YYYY-MM-DD, or null when there is no year.
 */
export function completeDocumentDate(
  date: { year?: number; month?: number; day?: number; lifetime?: boolean },
  kind: "birth" | "expiry",
): string | null {
  if (kind === "expiry" && date.lifetime) return LIFETIME_EXPIRY_DATE
  const { year, month, day } = date
  if (!year || year < 1900 || year > 2099) return null
  const pad = (n: number) => String(n).padStart(2, "0")
  if (!month) return kind === "birth" ? `${year}-12-31` : `${year}-01-01`
  if (month < 1 || month > 12) return null
  if (!day) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${year}-${pad(month)}-${pad(kind === "birth" ? last : 1)}`
  }
  const valid = new Date(Date.UTC(year, month - 1, day))
  if (valid.getUTCMonth() !== month - 1 || valid.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}
