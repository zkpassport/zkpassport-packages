import { estimatePassportIssueDate } from "@/passport/passport-chip-positions"
import { PassportViewModel } from "../types"
import { getDocumentType, getIssuingCountry } from "@/passport/credentials"
import { parseMRZ } from "@/passport/mrz"

export function getEventMetadataUtils(currentPassport: PassportViewModel) {
  let redactedSOD = undefined
  let issuingDate = undefined
  let document_issuer = undefined
  let document_nationality = undefined
  let document_type = undefined
  let documentExpiry = undefined

  try {
    if (currentPassport) {
      const preredactedSOD = currentPassport.sod.getRedactedSOD()
      redactedSOD = JSON.stringify(preredactedSOD)
      console.log("redactedSOD:", redactedSOD)
    } 
  } catch (error) {
    console.log("Error in preSendAPIChecks: " + error)
  }

  try {
    issuingDate = currentPassport?.dateOfIssue || 
    (currentPassport?.mrz ? estimatePassportIssueDate(currentPassport.mrz)?.toISOString().split('T')[0] : undefined)
    
    // If still no issuing date, use SOD certificate validity notBefore as fallback
    if (!issuingDate && currentPassport?.sod?.certificate?.tbs?.validity?.notBefore) {
      try {
        const notBeforeDate = new Date(currentPassport.sod.certificate.tbs.validity.notBefore)
        if (!isNaN(notBeforeDate.getTime())) {
          issuingDate = notBeforeDate.toISOString().split('T')[0]
          console.log("Using SOD certificate notBefore date as issuing date:", issuingDate)
        }
      } catch (sodError) {
        console.log("Error extracting date from SOD certificate:", sodError)
      }
    }
    
    console.log("issuingDate:", issuingDate)
  } catch (error) {
    console.log("Error in preSendAPIChecks: " + error)
  }

  try {
    if (currentPassport?.mrz) {
      document_issuer = getIssuingCountry(currentPassport)
    }
    if (currentPassport?.nationality) {
      document_nationality = currentPassport.nationality
    }
  } catch (error) {
    console.log("Error in preSendAPIChecks: " + error)
  }

  try {
    if (currentPassport?.mrz) {
      const parsedMrz = parseMRZ(currentPassport.mrz)
      documentExpiry = parsedMrz?.dateOfExpiry
    }
  } catch (error) {
    console.log("Error in preSendAPIChecks: " + error)
  }

  try {
    if (currentPassport?.mrz) {
      document_type = getDocumentType(currentPassport.mrz)
    }
  } catch (error) {
    console.log("Error in preSendAPIChecks: " + error)
  }

  return {
    redactedSOD,
    issuingDate,
    document_issuer,
    document_nationality,
    document_type,
    documentExpiry
  }
}

  export function getErrorMessage(error: any) {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === "string") {
      return error
    }
    return JSON.stringify(error)
  }