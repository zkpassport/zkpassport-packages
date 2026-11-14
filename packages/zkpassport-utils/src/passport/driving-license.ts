/**
 * North American driving licences (and state or provincial ID cards) carry their data in an
 * AAMVA PDF417 barcode rather than an MRZ. A camera-read licence is converted to a TD1 MRZ so the
 * circuits read it as they read an ID card's:
 *
 *   line 1: "DL", issuing country, the licence number in its overflow form, the subdivision
 *   line 2: date of birth, sex, expiry date, no nationality (a licence proves none)
 *   line 3: the name
 *
 * The number is always written in its overflow form (ICAO 9303 Part 5, note j): its first nine
 * characters, a filler in the check digit's place, then the rest of the number and its check
 * digit, then a filler and the state or province. The Tier 2 nullifier takes that whole area, so
 * two states issuing the same number never share a nullifier, and the disclosed nine characters
 * stay the licence's own.
 */
import { fieldsToTd1Mrz } from "./td1"

export { mrzCheckDigit } from "./td1"

export const DRIVING_LICENSE_DOCUMENT_CODE = "DL"
/** Room after the number's first 9 characters: the rest, its check digit, a filler, 2-3 letters */
const MAX_LICENSE_NUMBER_LENGTH = 20

export interface DrivingLicenseFields {
  /** ISO 3166-1 alpha-3: USA or CAN */
  country: string
  /** The state or province code, e.g. "CA" or "ON" */
  subdivision: string
  /** Upper case, letters and digits only */
  number: string
  surname: string
  givenNames: string
  /** YYYY-MM-DD */
  dateOfBirth: string
  /** YYYY-MM-DD */
  dateOfExpiry: string
  sex: "M" | "F" | "X" | ""
}

export class DrivingLicenseError extends Error {}

/**
 * The header: "ANSI ", the issuer's IIN (6 digits), the AAMVA version, the jurisdiction's version
 * (from version 2 on) and the number of subfiles, then one designator per subfile: its type
 * ("DL", "ID", "Z?") with an offset and a length. The first subfile follows on the same line.
 */
const HEADER = /ANSI ?\d{6}(\d{2})(?:\d{2})?\d{2}((?:[A-Z]{2}\d{8})+)/

/** The types of the barcode's subfiles ("DL", "ID", "Z?"), from the header's designators */
function subfileTypes(text: string): string[] {
  const designators = HEADER.exec(text)?.[2] ?? ""
  return [...designators.matchAll(/([A-Z]{2})\d{8}/g)].map((match) => match[1])
}

/** The barcode's data elements: a three-letter code, from "DAA" to "DDK", then the value */
function readElements(text: string): Map<string, string> {
  const elements = new Map<string, string>()
  const header = HEADER.exec(text)
  const body = header ? text.slice(header.index + header[0].length) : text
  // Elements end with a line feed, subfiles with a carriage return; the record separator (0x1e)
  // only appears in the header
  for (const raw of body.split(/[\n\r]+/)) {
    // The first element of a subfile follows the subfile type, "DL" or "ID"
    const line = /^\s*(DL|ID)D[A-Z]{2}/.test(raw) ? raw.trimStart().slice(2) : raw
    const match = /^(D[A-Z]{2})(.*)$/.exec(line)
    if (match && !elements.has(match[1])) elements.set(match[1], match[2].trim())
  }
  return elements
}

function aamvaVersion(text: string): number {
  const match = HEADER.exec(text)
  return match ? Number(match[1]) : 0
}

const isValidDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * Dates are MMDDCCYY in US barcodes and CCYYMMDD in Canadian and version 1 ones; the layout that
 * gives a real date is taken, the country's first.
 */
function parseDate(value: string | undefined, yearFirst: boolean): string | null {
  const digits = (value ?? "").replace(/\D/g, "")
  if (digits.length !== 8) return null
  const layouts = [
    { year: digits.slice(0, 4), month: digits.slice(4, 6), day: digits.slice(6, 8) },
    { year: digits.slice(4, 8), month: digits.slice(0, 2), day: digits.slice(2, 4) },
  ]
  for (const layout of yearFirst ? layouts : layouts.reverse()) {
    if (isValidDate(Number(layout.year), Number(layout.month), Number(layout.day))) {
      return `${layout.year}-${layout.month}-${layout.day}`
    }
  }
  return null
}

function parseSex(value: string | undefined): DrivingLicenseFields["sex"] {
  switch ((value ?? "").trim().toUpperCase()) {
    case "1":
    case "M":
      return "M"
    case "2":
    case "F":
      return "F"
    case "9":
    case "X":
      return "X"
    default:
      return ""
  }
}

const SUBDIVISION = /^[A-Z]{2,3}$/

/** The fields of an AAMVA barcode, as text; throws when one a licence must have is missing */
export function parseAamvaBarcode(text: string): DrivingLicenseFields {
  if (!text.includes("ANSI") && !text.includes("AAMVA")) {
    throw new DrivingLicenseError("Not an AAMVA barcode")
  }
  const elements = readElements(text)
  const get = (code: string) => elements.get(code) || undefined
  const country = (get("DCG") ?? "USA").toUpperCase()
  if (country !== "USA" && country !== "CAN") {
    throw new DrivingLicenseError(`Unsupported licence country ${country}`)
  }
  const yearFirst = country === "CAN" || aamvaVersion(text) === 1
  // A non-driver ID card carries an "ID" subfile and no "DL" one. It would be proven under the
  // licence's document code, so it is refused until it has a document code of its own
  const types = subfileTypes(text)
  if (types.includes("ID") && !types.includes("DL")) {
    throw new DrivingLicenseError("An identification card, not a driving licence, is not supported")
  }

  // Version 1 writes the whole name in DAA, "FAMILY,GIVEN,MIDDLE"
  const [fullFamily, ...fullGiven] = (get("DAA") ?? "").split(/,|\$/)
  const surname = get("DCS") ?? get("DAB") ?? fullFamily
  const givenNames = [get("DAC") ?? get("DCT") ?? fullGiven[0], get("DAD") ?? fullGiven[1]]
    .filter((part): part is string => !!part && part.toUpperCase() !== "NONE")
    .join(" ")
    .replace(/,/g, " ")

  const fields: DrivingLicenseFields = {
    country,
    subdivision: (get("DAJ") ?? "").toUpperCase(),
    number: (get("DAQ") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    surname: (surname ?? "").trim(),
    givenNames: givenNames.trim(),
    dateOfBirth: parseDate(get("DBB"), yearFirst) ?? "",
    dateOfExpiry: parseDate(get("DBA"), yearFirst) ?? "",
    sex: parseSex(get("DBC")),
  }
  const missing = [
    !SUBDIVISION.test(fields.subdivision) && "state",
    !fields.number && "number",
    !fields.surname && "surname",
    !fields.dateOfBirth && "date of birth",
    !fields.dateOfExpiry && "expiry date",
  ].filter(Boolean)
  if (missing.length > 0) {
    throw new DrivingLicenseError(`The licence barcode has no ${missing.join(", ")}`)
  }
  if (fields.number.length > MAX_LICENSE_NUMBER_LENGTH) {
    throw new DrivingLicenseError("The licence number is too long")
  }
  return fields
}

/** The TD1 MRZ (3 x 30, no separators) a licence is proven as */
export function drivingLicenseToMrz(license: DrivingLicenseFields): string {
  try {
    return fieldsToTd1Mrz({
      documentCode: DRIVING_LICENSE_DOCUMENT_CODE,
      issuingCountry: license.country,
      // A licence proves no nationality
      nationality: "",
      number: license.number,
      // The state after the number, so two states never share a nullifier
      numberSuffix: license.subdivision,
      surname: license.surname,
      givenNames: license.givenNames,
      dateOfBirth: license.dateOfBirth,
      dateOfExpiry: license.dateOfExpiry,
      sex: license.sex,
    })
  } catch (error) {
    throw new DrivingLicenseError((error as Error).message)
  }
}
