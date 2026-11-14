/**
 * A national ID card without a machine-readable zone, read by camera from its printed text, as the
 * TD1 MRZ it is proven as. It discloses as an ID card ("ID"), like one read from its MRZ; how it
 * was verified is the verification method's business (device-attested, tier 2).
 *
 * The rules that fill in what a card doesn't print feed the Tier 2 nullifier, so they never change:
 * see completeDocumentDate. A card missing a required field is refused rather than guessed.
 */
import { completeDocumentDate, fieldsToTd1Mrz, Td1MrzError } from "./td1"

export const PRINTED_ID_DOCUMENT_CODE = "ID"

/**
 * Where a card's nationality comes from:
 * - "printed": the nationality the card prints (cards issued to citizens and residents alike,
 *   e.g. the Emirates ID); none when it isn't read
 * - "issuer": the issuing country (cards issued to citizens only)
 * - "none": the card proves no nationality (e.g. residency-based IDs)
 */
export type PrintedIdNationality = "printed" | "issuer" | "none"

export interface PrintedDate {
  year?: number
  month?: number
  day?: number
  /** The card says it is valid for life */
  lifetime?: boolean
}

export interface PrintedIdFields {
  /** ISO 3166-1 alpha-3 */
  issuingCountry: string
  nationalityRule: PrintedIdNationality
  /** ISO 3166-1 alpha-3 as printed, when the card prints one */
  printedNationality?: string
  /** As printed; separators are dropped */
  number: string
  /** In Latin script */
  surname: string
  /** In Latin script */
  givenNames: string
  dateOfBirth: PrintedDate
  dateOfExpiry: PrintedDate
  sex: "M" | "F" | "X" | ""
}

export class PrintedIdError extends Error {}

function nationalityOf(fields: PrintedIdFields): string {
  switch (fields.nationalityRule) {
    case "issuer":
      return fields.issuingCountry
    case "printed": {
      const printed = (fields.printedNationality ?? "").trim().toUpperCase()
      return /^[A-Z]{3}$/.test(printed) ? printed : ""
    }
    default:
      return ""
  }
}

/** The TD1 MRZ a national ID read from its printed text is proven as */
export function printedIdToMrz(fields: PrintedIdFields): string {
  const number = fields.number.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const dateOfBirth = completeDocumentDate(fields.dateOfBirth, "birth")
  const dateOfExpiry = completeDocumentDate(fields.dateOfExpiry, "expiry")
  const missing = [
    !number && "number",
    !fields.surname.trim() && !fields.givenNames.trim() && "name",
    !dateOfBirth && "date of birth",
    !dateOfExpiry && "expiry date",
  ].filter(Boolean)
  if (missing.length > 0) {
    throw new PrintedIdError(`The ID has no ${missing.join(", ")}`)
  }
  try {
    return fieldsToTd1Mrz({
      documentCode: PRINTED_ID_DOCUMENT_CODE,
      issuingCountry: fields.issuingCountry.toUpperCase(),
      nationality: nationalityOf(fields),
      number,
      surname: fields.surname,
      givenNames: fields.givenNames,
      dateOfBirth: dateOfBirth!,
      dateOfExpiry: dateOfExpiry!,
      sex: fields.sex,
    })
  } catch (error) {
    if (error instanceof Td1MrzError) throw new PrintedIdError(error.message)
    throw error
  }
}
