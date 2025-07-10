import { PassportViewModel } from "@/types"

export function getMRZDate(date: string, thresholdYear: Date = new Date()): Date {
  if (date.length !== 6) {
    return new Date()
  }

  const year = parseInt(date.slice(0, 2), 10)
  const month = parseInt(date.slice(2, 4), 10) - 1 // JS months are 0-indexed
  const day = parseInt(date.slice(4, 6), 10)

  // Determine the century
  const century = year <= thresholdYear.getFullYear() % 100 ? 2000 : 1900

  const fullYear = century + year
  return new Date(Date.UTC(fullYear, month, day, 0, 0, 0, 0))
}

export function getPassportExpiryDate(passportExpiry: string) {
  return getMRZDate(
    passportExpiry,
    new Date(new Date().getFullYear() + 30, new Date().getMonth(), new Date().getDate()),
  )
}

export function getIssuingCountryCode(passport: PassportViewModel) {
  if (passport && passport.mrz) {
    const alpha3Code = passport.mrz.slice(2, 5)
    if (alpha3Code === "D<<") {
      return "DEU"
    }
    return alpha3Code
  }
  return ""
}

function getCheckDigit(value: string) {
  const multipliers = [7, 3, 1]
  const charMap: {
    [key: string]: string
  } = {
    "0": "0",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9",
    "<": "0",
    " ": "0",
    "A": "10",
    "B": "11",
    "C": "12",
    "D": "13",
    "E": "14",
    "F": "15",
    "G": "16",
    "H": "17",
    "I": "18",
    "J": "19",
    "K": "20",
    "L": "21",
    "M": "22",
    "N": "23",
    "O": "24",
    "P": "25",
    "Q": "26",
    "R": "27",
    "S": "28",
    "T": "29",
    "U": "30",
    "V": "31",
    "W": "32",
    "X": "33",
    "Y": "34",
    "Z": "35",
  }
  let sum = 0
  for (let i = 0; i < value.length; i++) {
    const mapVal = Number(charMap[value[i]])
    sum += mapVal * multipliers[i % 3]
  }
  return sum % 10
}

function verifyChecksum(value: string, checkDigit: number) {
  return getCheckDigit(value) === checkDigit
}

export function getCountryCodeFromMRZ(mrz: string | null) {
  return mrz && mrz.length >= 5 ? mrz.substring(2, 5) : "unknown"
}

export function parseMRZ(mrz: string) {
  try {
    let formattedMrz = mrz.replaceAll(/\s/gi, "")
    let documentNumber = ""
    let dateOfBirth = ""
    let dateOfExpiry = ""
    //console.log("formattedMrz", formattedMrz)
    if (formattedMrz.startsWith("P") && formattedMrz.length === 88) {
      // Sometimes the document number can be shorter than 9 characters,
      // these are padded with < and we need to remove them
      documentNumber = formattedMrz.slice(44, 44 + 9).replaceAll("<", "")

      dateOfBirth = formattedMrz.slice(57, 57 + 6)

      dateOfExpiry = formattedMrz.slice(65, 65 + 6)

      if (
        !verifyChecksum(documentNumber, Number(formattedMrz[44 + 9])) ||
        !verifyChecksum(dateOfBirth, Number(formattedMrz[57 + 6])) ||
        !verifyChecksum(dateOfExpiry, Number(formattedMrz[65 + 6]))
      ) {
        throw new Error("Invalid checksum")
      }
    } else if (
      (formattedMrz.startsWith("I") ||
        formattedMrz.startsWith("A") ||
        formattedMrz.startsWith("C")) &&
      formattedMrz.length === 90
    ) {
      // Sometimes the document number can be shorter than 9 characters,
      // these are padded with < and we need to remove them
      documentNumber = formattedMrz.slice(5, 5 + 9).replaceAll("<", "")
      dateOfBirth = formattedMrz.slice(30, 30 + 6)
      dateOfExpiry = formattedMrz.slice(38, 38 + 6)

      let documentNumberCheckDigit = formattedMrz[5 + 9]

      // If the document number check digit is <, we need to check the extended document number
      const extendedDocumentNumber =
        documentNumberCheckDigit == "<" ? formattedMrz.slice(5 + 10, 30).replaceAll("<", "") : ""
      // If the extended document number is not empty, we need to add it to the document number
      if (extendedDocumentNumber && extendedDocumentNumber.length > 0) {
        // The last character of the extended document number is a check digit,
        // so we need to remove it
        documentNumberCheckDigit = extendedDocumentNumber[extendedDocumentNumber.length - 1]
        documentNumber = documentNumber + extendedDocumentNumber.slice(0, -1)
      }

      //console.log("documentNumber", documentNumber)
      //console.log("documentNumberCheckDigit", documentNumberCheckDigit)
      //console.log("computed check digit", getCheckDigit(documentNumber))

      if (
        !verifyChecksum(documentNumber, Number(documentNumberCheckDigit)) ||
        !verifyChecksum(dateOfBirth, Number(formattedMrz[30 + 6])) ||
        !verifyChecksum(dateOfExpiry, Number(formattedMrz[38 + 6]))
      ) {
        throw new Error("Invalid checksum")
      }
    } else {
      throw new Error("Invalid MRZ")
    }
    return {
      documentNumber,
      dateOfBirth,
      dateOfExpiry,
    }
  } catch (error) {
    console.error("Error scanning MRZ: " + error)
    return null
  }
}

// Helper function to pad string with < characters
export const padWithChevrons = (value: string, length: number): string => {
  return value.length >= length
    ? value.slice(0, length)
    : value + "<".repeat(length - value.length)
}

// Format date for display (YYMMDD -> DD/MM/YY)
export const formatDateDisplay = (dateStr: string): string => {
  if (dateStr.length === 6) {
    const year = dateStr.slice(0, 2)
    const month = dateStr.slice(2, 4)
    const day = dateStr.slice(4, 6)
    return `${day}/${month}/${year}`
  }
  return ""
} 

// Construct MRZ from manual inputs
export const constructMrzFromManualInput = (
  documentNumber: string,
  dateOfBirth: string,
  dateOfExpiry: string,
  documentType: "passport" | "id_card" | "residence_permit" | "other"
): string => {
  if (documentType === "passport") {
    // TD3 format (passport): 2 lines of 44 characters each
    // Line 1: P<ISSname<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
    // Line 2: documentNumber(9)checkDigit(1)nationality(3)dateOfBirth(6)checkDigit(1)sex(1)dateOfExpiry(6)checkDigit(1)personalNumber(14)checkDigit(1)

    const line1 = "P<XXX" + "<".repeat(39) // Placeholder line 1

    const paddedDocNumber = padWithChevrons(documentNumber, 9)
    const docCheckDigit = getCheckDigit(paddedDocNumber)
    const nationality = "XXX" // Placeholder nationality
    const dobCheckDigit = getCheckDigit(dateOfBirth)
    const sex = "<" // Placeholder sex
    const expCheckDigit = getCheckDigit(dateOfExpiry)
    const personalNumber = "<".repeat(14) // Empty personal number
    const personalCheckDigit = getCheckDigit(personalNumber)

    // Calculate overall check digit
    const overallData =
      paddedDocNumber +
      docCheckDigit +
      dateOfBirth +
      dobCheckDigit +
      dateOfExpiry +
      expCheckDigit +
      personalNumber +
      personalCheckDigit
    const overallCheckDigit = getCheckDigit(overallData)

    const line2 =
      paddedDocNumber +
      docCheckDigit +
      nationality +
      dateOfBirth +
      dobCheckDigit +
      sex +
      dateOfExpiry +
      expCheckDigit +
      personalNumber +
      personalCheckDigit +
      overallCheckDigit

    return line1 + "\n" + line2
  } else {
    // TD1 format (ID card): 3 lines of 30 characters each
    // Line 1: docType(2)issuingState(3)documentNumber(9)checkDigit(1)optional(15)
    // Line 2: dateOfBirth(6)checkDigit(1)sex(1)dateOfExpiry(6)checkDigit(1)nationality(3)optional(11)checkDigit(1)
    // Line 3: names(30)

    const docTypeCode = "I<" // ID card
    const issuingState = "XXX" // Placeholder issuing state
    const paddedDocNumber = padWithChevrons(documentNumber, 9)
    const docCheckDigit = getCheckDigit(paddedDocNumber)
    const optional1 = "<".repeat(15)

    const line1 = docTypeCode + issuingState + paddedDocNumber + docCheckDigit + optional1

    const dobCheckDigit = getCheckDigit(dateOfBirth)
    const sex = "<" // Placeholder sex
    const expCheckDigit = getCheckDigit(dateOfExpiry)
    const nationality = "XXX" // Placeholder nationality
    const optional2 = "<".repeat(11)

    // Calculate line 2 check digit
    const line2Data =
      dateOfBirth + dobCheckDigit + sex + dateOfExpiry + expCheckDigit + nationality + optional2
    const line2CheckDigit = getCheckDigit(line2Data)

    const line2 =
      dateOfBirth +
      dobCheckDigit +
      sex +
      dateOfExpiry +
      expCheckDigit +
      nationality +
      optional2 +
      line2CheckDigit

    const line3 = "<".repeat(30) // Placeholder names

    return line1 + "\n" + line2 + "\n" + line3
  }
}

// Helper function to extract data from MRZ even if checksums are invalid
export const extractMrzData = (mrz: string, docType: string) => {
  try {
    const formattedMrz = mrz.replaceAll(/\s/gi, "")

    if (docType === "passport" && formattedMrz.startsWith("P") && formattedMrz.length === 88) {
      // TD3 format (passport)
      const documentNumber = formattedMrz.slice(44, 44 + 9).replaceAll("<", "")
      const dateOfBirth = formattedMrz.slice(57, 57 + 6)
      const dateOfExpiry = formattedMrz.slice(65, 65 + 6)

      return { documentNumber, dateOfBirth, dateOfExpiry }
    } else if (
      (formattedMrz.startsWith("I") ||
        formattedMrz.startsWith("A") ||
        formattedMrz.startsWith("C")) &&
      formattedMrz.length === 90
    ) {
      // TD1 format (ID card)
      let documentNumber = formattedMrz.slice(5, 5 + 9).replaceAll("<", "")
      const dateOfBirth = formattedMrz.slice(30, 30 + 6)
      const dateOfExpiry = formattedMrz.slice(38, 38 + 6)

      // Handle extended document number if present
      const documentNumberCheckDigit = formattedMrz[5 + 9]
      if (documentNumberCheckDigit === "<") {
        const extendedDocumentNumber = formattedMrz.slice(5 + 10, 30).replaceAll("<", "")
        if (extendedDocumentNumber && extendedDocumentNumber.length > 0) {
          documentNumber = documentNumber + extendedDocumentNumber.slice(0, -1)
        }
      }

      return { documentNumber, dateOfBirth, dateOfExpiry }
    }
  } catch (error) {
    console.warn("Failed to extract MRZ data:", error)
  }
  return null
}
