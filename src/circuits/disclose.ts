import { rightPadArrayWithZeros } from "../utils"
import { ProofData } from "."
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

interface DisclosedDataRaw {
  issuingCountry: Uint8Array // 3 bytes
  nationality: Uint8Array // 3 bytes
  documentType: Uint8Array // 2 bytes
  documentNumber: Uint8Array // 9 bytes
  dateOfExpiry: Uint8Array // 6 bytes
  dateOfBirth: Uint8Array // 6 bytes
  name: Uint8Array // 39 bytes
  gender: Uint8Array // 1 byte
}

function stripChevrons(str: string): string {
  return str.replace(/^<+|<+$/g, "").replace(/</g, " ")
}

/**
 * Get rid of the chevrons and replace them with spaces
 * Also remove all other non roman characters and replace
 * characters with diacritics with their base character
 * @param name
 */
export function formatName(name: string): string {
  return name
    .replace(/<+/g, " ")
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .replace(/[áàâäãå]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôöõ]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/[ñ]/g, "n")
    .replace(/[ç]/g, "c")
    .replace(/[æ]/g, "ae")
    .replace(/[œ]/g, "oe")
    .replace(/[ø]/g, "o")
    .replace(/[æ]/g, "ae")
    .replace(/[œ]/g, "oe")
    .replace(/[ø]/g, "o")
    .replace(/[^a-zA-Z ]/g, "")
    .trim()
}

export function parseDocumentType(documentType: string): string {
  if (documentType.startsWith("P")) {
    return "passport"
  } else if (documentType === "IR" || documentType === "AR") {
    return "residence_permit"
  } else if (documentType.startsWith("I")) {
    return "id_card"
  } else {
    return "other"
  }
}

export function getDisclosedBytesFromMrzAndMask(mrz: string, mask: number[]): number[] {
  const mrzBytes = new TextEncoder().encode(mrz)
  const maskBytes = new Uint8Array(mask)

  const disclosedBytes = mrzBytes.map((byte, index) => {
    if (maskBytes[index] === 1) {
      return byte
    }
    return 0
  })

  return rightPadArrayWithZeros(Array.from(disclosedBytes), 90)
}

export class DisclosedData {
  readonly issuingCountry: string // 3-letter country code
  readonly nationality: string // 3-letter country code
  readonly documentType: string // 2-letter document type
  readonly documentNumber: string // Document number
  readonly dateOfExpiry: Date // Expiry date
  readonly dateOfBirth: Date // Birth date
  readonly name: string // Full name
  readonly firstName: string // First name
  readonly lastName: string // Last name
  readonly gender: string // Gender

  constructor(data: {
    issuingCountry: string
    nationality: string
    documentType: string
    documentNumber: string
    dateOfExpiry: Date
    dateOfBirth: Date
    name: string
    firstName: string
    lastName: string
    gender: string
  }) {
    this.issuingCountry = data.issuingCountry
    this.nationality = data.nationality
    this.documentType = data.documentType
    this.documentNumber = data.documentNumber
    this.dateOfExpiry = data.dateOfExpiry
    this.dateOfBirth = data.dateOfBirth
    this.name = data.name
    this.gender = data.gender
    this.firstName = data.firstName
    this.lastName = data.lastName
  }

  static fromDisclosedBytes(
    disclosedBytes: number[],
    idType: "passport" | "id_card",
  ): DisclosedData {
    const raw: DisclosedDataRaw = {
      issuingCountry: new Uint8Array(disclosedBytes.slice(2, 5)),
      nationality: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 45 : 54, idType === "id_card" ? 48 : 57),
      ),
      documentType: new Uint8Array(disclosedBytes.slice(0, 2)),
      documentNumber: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 5 : 44, idType === "id_card" ? 14 : 53),
      ),
      dateOfExpiry: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 38 : 65, idType === "id_card" ? 44 : 71),
      ),
      dateOfBirth: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 30 : 57, idType === "id_card" ? 36 : 63),
      ),
      name: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 60 : 5, idType === "id_card" ? 90 : 44),
      ),
      gender: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 37 : 64, idType === "id_card" ? 38 : 65),
      ),
    }

    const decoder = new TextDecoder()
    const decode = (arr: Uint8Array) => decoder.decode(arr).replace(/\0/g, "")

    const unformattedName = raw.name && raw.name.length > 0 ? decode(raw.name) : ""
    const indexOfDoubleChevron = unformattedName.indexOf("<<")
    const lastName =
      indexOfDoubleChevron >= 0 ? unformattedName.substring(0, indexOfDoubleChevron) : ""
    const firstName =
      indexOfDoubleChevron >= 0 ? unformattedName.substring(indexOfDoubleChevron + 2) : ""
    // To reverse the order as in passports it's lastName first
    const fullName = firstName + " " + lastName

    return new DisclosedData({
      issuingCountry: decode(raw.issuingCountry),
      nationality: decode(raw.nationality),
      documentType: parseDocumentType(decode(raw.documentType)),
      documentNumber: stripChevrons(decode(raw.documentNumber)),
      dateOfExpiry: parseDate(raw.dateOfExpiry),
      dateOfBirth: parseDate(raw.dateOfBirth),
      name: formatName(fullName),
      firstName: formatName(firstName),
      lastName: formatName(lastName),
      gender: decode(raw.gender),
    })
  }

  static fromFlagsProof(proof: ProofData): DisclosedData {
    const disclosedBytes = proof.publicInputs.slice(3, 93).map((hex) => parseInt(hex, 16))

    const raw: DisclosedDataRaw = {
      issuingCountry: new Uint8Array(disclosedBytes.slice(0, 3)),
      nationality: new Uint8Array(disclosedBytes.slice(3, 6)),
      documentType: new Uint8Array(disclosedBytes.slice(6, 8)),
      documentNumber: new Uint8Array(disclosedBytes.slice(8, 17)),
      dateOfExpiry: new Uint8Array(disclosedBytes.slice(17, 23)),
      dateOfBirth: new Uint8Array(disclosedBytes.slice(23, 29)),
      name: new Uint8Array(disclosedBytes.slice(29, 68)),
      gender: new Uint8Array(disclosedBytes.slice(68, 69)),
    }

    const decoder = new TextDecoder()
    const decode = (arr: Uint8Array) => decoder.decode(arr).replace(/\0/g, "")

    const unformattedName = raw.name && raw.name.length > 0 ? decode(raw.name) : ""
    const indexOfDoubleChevron = unformattedName.indexOf("<<")
    const lastName =
      indexOfDoubleChevron > 0 ? unformattedName.substring(0, indexOfDoubleChevron) : ""
    const firstName =
      indexOfDoubleChevron > 0 ? unformattedName.substring(indexOfDoubleChevron + 2) : ""
    // To reverse the order as in passports it's lastName first
    const fullName = firstName + " " + lastName

    return new DisclosedData({
      issuingCountry: decode(raw.issuingCountry),
      nationality: decode(raw.nationality),
      documentType: parseDocumentType(decode(raw.documentType)),
      documentNumber: stripChevrons(decode(raw.documentNumber)),
      dateOfExpiry: parseDate(raw.dateOfExpiry),
      dateOfBirth: parseDate(raw.dateOfBirth),
      name: formatName(fullName),
      firstName: formatName(firstName),
      lastName: formatName(lastName),
      gender: decode(raw.gender),
    })
  }

  static fromBytesProof(proof: ProofData, idType: "passport" | "id_card"): DisclosedData {
    const disclosedBytesStartIndex = 93
    const disclosedBytesEndIndex = 182
    const disclosedBytes = proof.publicInputs
      .slice(disclosedBytesStartIndex, disclosedBytesEndIndex)
      .map((hex) => parseInt(hex, 16))

    const raw: DisclosedDataRaw = {
      issuingCountry: new Uint8Array(disclosedBytes.slice(2, 5)),
      nationality: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 45 : 54, idType === "id_card" ? 48 : 57),
      ),
      documentType: new Uint8Array(disclosedBytes.slice(0, 2)),
      documentNumber: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 5 : 44, idType === "id_card" ? 14 : 53),
      ),
      dateOfExpiry: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 38 : 65, idType === "id_card" ? 44 : 71),
      ),
      dateOfBirth: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 30 : 57, idType === "id_card" ? 36 : 63),
      ),
      name: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 60 : 5, idType === "id_card" ? 90 : 44),
      ),
      gender: new Uint8Array(
        disclosedBytes.slice(idType === "id_card" ? 37 : 64, idType === "id_card" ? 38 : 65),
      ),
    }

    const decoder = new TextDecoder()
    const decode = (arr: Uint8Array) => decoder.decode(arr).replace(/\0/g, "")

    const unformattedName = raw.name && raw.name.length > 0 ? decode(raw.name) : ""
    const indexOfDoubleChevron = unformattedName.indexOf("<<")
    const lastName =
      indexOfDoubleChevron >= 0 ? unformattedName.substring(0, indexOfDoubleChevron) : ""
    const firstName =
      indexOfDoubleChevron >= 0 ? unformattedName.substring(indexOfDoubleChevron + 2) : ""
    // To reverse the order as in passports it's lastName first
    const fullName = firstName + " " + lastName

    return new DisclosedData({
      issuingCountry: decode(raw.issuingCountry),
      nationality: decode(raw.nationality),
      documentType: parseDocumentType(decode(raw.documentType)),
      documentNumber: stripChevrons(decode(raw.documentNumber)),
      dateOfExpiry: parseDate(raw.dateOfExpiry),
      dateOfBirth: parseDate(raw.dateOfBirth),
      name: formatName(fullName),
      firstName: formatName(firstName),
      lastName: formatName(lastName),
      gender: decode(raw.gender),
    })
  }
}

export function parseDate(bytes: Uint8Array): Date {
  const str = new TextDecoder().decode(bytes).replace(/\0/g, "")
  // Format: YYMMDD
  const year = parseInt(str.substring(0, 2))
  const month = parseInt(str.substring(2, 4)) - 1 // JS months are 0-based (yes, that's retarded)
  const day = parseInt(str.substring(4, 6))
  // Assume current century (e.g. 20YY) for dates unless that would make it more than 10 years in the future
  const currentYear = new Date().getFullYear()
  const currentCentury = Math.floor(currentYear / 100) * 100
  const previousCentury = currentCentury - 100
  const fullYear =
    year + (year + currentCentury > currentYear + 10 ? previousCentury : currentCentury)
  return new Date(Date.UTC(fullYear, month, day, 0, 0, 0, 0))
}

function formatDateToBytes(date: Date): Uint8Array {
  const year = date.getFullYear() % 100 // Get last 2 digits
  const month = date.getMonth() + 1 // JS months are 0-based
  const day = date.getDate()

  const str = `${year.toString().padStart(2, "0")}${month.toString().padStart(2, "0")}${day
    .toString()
    .padStart(2, "0")}`
  return new TextEncoder().encode(str)
}

export function createDisclosedDataRaw(data: {
  issuingCountry: Uint8Array | string
  nationality: Uint8Array | string
  documentType: Uint8Array | string
  documentNumber: Uint8Array | string
  dateOfExpiry: Uint8Array | string | Date
  dateOfBirth: Uint8Array | string | Date
  name: Uint8Array | string
  gender: Uint8Array | string
}): DisclosedDataRaw {
  const encoder = new TextEncoder()

  function padArray(arr: Uint8Array, length: number): Uint8Array {
    if (arr.length === length) return arr
    const result = new Uint8Array(length)
    result.set(arr.slice(0, length))
    return result
  }

  function processInput(input: Uint8Array | string | Date, length: number): Uint8Array {
    if (input instanceof Date) {
      return padArray(formatDateToBytes(input), length)
    }
    const arr = typeof input === "string" ? encoder.encode(input) : input
    return padArray(arr, length)
  }

  return {
    issuingCountry: processInput(data.issuingCountry, 3),
    nationality: processInput(data.nationality, 3),
    documentType: processInput(data.documentType, 2),
    documentNumber: processInput(data.documentNumber, 9),
    dateOfExpiry: processInput(data.dateOfExpiry, 6),
    dateOfBirth: processInput(data.dateOfBirth, 6),
    name: processInput(data.name, 39),
    gender: processInput(data.gender, 1),
  }
}

/**
 * Get the number of public inputs for the disclose bytes proof.
 * @returns The number of public inputs.
 */
export function getDiscloseBytesProofPublicInputCount(): number {
  return 5
}

/**
 * Get the number of public inputs for the disclose flags proof.
 * @returns The number of public inputs.
 */
export function getDiscloseFlagsProofPublicInputCount(): number {
  return 73
}

/**
 * Get the parameter commitment for the disclose proof.
 * @param discloseMask - The disclose mask.
 * @param disclosedBytes - The disclosed bytes.
 * @returns The parameter commitment.
 */
export async function getDiscloseParameterCommitment(
  discloseMask: number[],
  disclosedBytes: number[],
): Promise<bigint> {
  const parameterCommitment = await poseidon2HashAsync([
    ...discloseMask.map((x) => BigInt(x)),
    ...disclosedBytes.map((x) => BigInt(x)),
  ])
  return parameterCommitment
}
