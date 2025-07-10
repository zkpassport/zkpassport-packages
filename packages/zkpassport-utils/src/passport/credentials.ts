
import { getCountryName } from "@/country/country"
import { DisclosureCircuitName, IDCredential, PassportViewModel, Query, QueryResult, QueryResultValue } from "@/types"
import { format, intervalToDuration, isDate } from "date-fns"
import { getMRZDate, getPassportExpiryDate } from "./mrz"
import { capitalizeEveryWord } from "@/utils"
import { formatName } from ".."

export function hasRequestedAccessToField(credentialsRequest: Query, field: IDCredential): boolean {
  const fieldValue = credentialsRequest[field as keyof Query]
  const isDefined = fieldValue !== undefined && fieldValue !== null
  if (!isDefined) {
    return false
  }
  for (const key in fieldValue) {
    if (
      fieldValue[key as keyof typeof fieldValue] !== undefined &&
      fieldValue[key as keyof typeof fieldValue] !== null
    ) {
      return true
    }
  }
  return false
}

export function hasRequestedAccessToAnyField(credentialsRequest: Query): boolean {
  return Object.keys(credentialsRequest).some((key) =>
    hasRequestedAccessToField(credentialsRequest, key as IDCredential),
  )
}


export function getDocumentType(value: string) {
  if (value.startsWith("P")) {
    return "passport"
  } else if (value == "IR" || value == "AR" || value == "CR") {
    return "residence_permit"
  } else if (value.startsWith("I") || value.startsWith("C")) {
    return "id_card"
  } else {
    return "other"
  }
}

export function getDisplayDocumentType(value: string) {
  const documentType = getDocumentType(value)
  switch (documentType) {
    case "passport":
      return "Passport"
    case "residence_permit":
      return "Residence Permit"
    case "id_card":
      return "National ID"
    default:
      return "Other"
  }
}

export function getIssuingCountry(passport: PassportViewModel) {
  if (passport && passport.mrz) {
    const country = passport.mrz.slice(2, 5)
    return getCountryName(country)
  }
  return ""
}



export function isValidBase64Image(image: any) {
  return (
    !!image &&
    typeof image === "string" &&
    /^data:image\/(png|jpeg|jpg);base64,/.test(image) &&
    image.length > 22
  )
}

export function getAge(dateOfBirth: string): number {
  const birthDate = getMRZDate(dateOfBirth)
  const today = new Date()
  const duration = intervalToDuration({
    start: birthDate,
    end: today,
  })
  return duration.years ?? 0
}

function formatDiscloseValue(field: IDCredential, value: string | number | Date | string[]) {
  if (field === "document_type") {
    if (typeof value === "string") {
      return getDocumentType(value)
    }
  }
  if (field === "firstname" || field === "lastname" || field === "fullname") {
    return capitalizeEveryWord(value as string)
  }
  if (field === "expiry_date") {
    return getPassportExpiryDate(value as string)
  }
  if (field === "birthdate") {
    return getMRZDate(value as string)
  }
  return value
}

function getQueryResultValue(
  query: Query,
  field: IDCredential,
  value: string | number | string[] | Date,
): QueryResultValue | undefined {
  const queryField = query[field]
  const isValueDate = value instanceof Date || isDate(value)
  const result: QueryResultValue = {
    eq:
      queryField && queryField.eq
        ? {
            expected: queryField.eq,
            result: (() => {
              if (field === "document_type") {
                if ((value as string).startsWith("P")) {
                  return queryField.eq === "passport"
                } else if ((value as string) == "IR" || (value as string) == "AR") {
                  return queryField.eq === "residence_permit"
                } else if ((value as string).startsWith("I")) {
                  return queryField.eq === "id_card"
                } else {
                  return queryField.eq === "other"
                }
              } else if (typeof value === "string") {
                return value.toLowerCase().trim() == queryField.eq.toLowerCase().trim()
              } else if (typeof value === "number") {
                return value == queryField.eq
              } else if (Array.isArray(value)) {
                return (
                  value.sort().join(",").toLowerCase().trim() ==
                  queryField.eq.sort().join(",").toLowerCase().trim()
                )
              }
              return false
            })(),
          }
        : undefined,
    gt:
      queryField && queryField.gt
        ? {
            expected: queryField.gt,
            result: isValueDate ? value > new Date(queryField.gt) : value > queryField.gt,
          }
        : undefined,
    gte:
      queryField && queryField.gte
        ? {
            expected: queryField.gte,
            result: isValueDate ? value >= new Date(queryField.gte) : value >= queryField.gte,
          }
        : undefined,
    lte:
      queryField && queryField.lte
        ? {
            expected: queryField.lte,
            result: isValueDate ? value <= new Date(queryField.lte) : value <= queryField.lte,
          }
        : undefined,
    lt:
      queryField && queryField.lt
        ? {
            expected: queryField.lt,
            result: isValueDate ? value < new Date(queryField.lt) : value < queryField.lt,
          }
        : undefined,
    range:
      queryField && queryField.range
        ? {
            expected: queryField.range,
            result: isValueDate
              ? value >= new Date(queryField.range[0]) && value <= new Date(queryField.range[1])
              : value >= queryField.range[0] && value < queryField.range[1],
          }
        : undefined,
    disclose: queryField?.disclose ? { result: formatDiscloseValue(field, value) } : undefined,
    in:
      queryField && queryField.in
        ? {
            expected: queryField.in,
            result: queryField.in.includes(value),
          }
        : undefined,
    out:
      queryField && queryField.out
        ? {
            expected: queryField.out,
            result: !queryField.out.includes(value),
          }
        : undefined,
  }
  for (const key in result) {
    if (!result[key as keyof QueryResultValue]) {
      delete result[key as keyof QueryResultValue]
    }
  }
  return result
}

function getFullName(passport: PassportViewModel) {
  const mrz = passport.mrz
  const idType = getDocumentType(mrz.slice(0, 2))
  const unformattedName = mrz.slice(idType === "passport" ? 5 : 60, idType === "passport" ? 44 : 90)

  const indexOfDoubleChevron = unformattedName.indexOf("<<")
  const lastName =
    indexOfDoubleChevron > 0 ? unformattedName.substring(0, indexOfDoubleChevron) : ""
  const firstName =
    indexOfDoubleChevron > 0 ? unformattedName.substring(indexOfDoubleChevron + 2) : ""

  const mrzFullName = formatName(firstName + " " + lastName)
  const fullName = passport.fullName ?? passport.name
  if (mrzFullName && fullName && mrzFullName.length > fullName.length) {
    return mrzFullName
  }
  return fullName
}

export function hasQueryResultFalseValue(
  queryResult: QueryResult,
  field: IDCredential,
  keys?: (keyof QueryResultValue)[],
) {
  const value = queryResult[field as keyof QueryResult] as QueryResultValue
  if (!value) {
    return false
  }
  if (keys) {
    for (const key of keys) {
      if (value[key] && value[key]?.result === false) {
        return true
      }
    }
  } else {
    for (const key in value) {
      if (
        value[key as keyof QueryResultValue] &&
        value[key as keyof QueryResultValue]?.result === false
      ) {
        return true
      }
    }
  }
  return false
}

export function canGenerateProofForCircuit(
  circuitName: DisclosureCircuitName,
  queryResult: QueryResult,
) {
  if (circuitName === "compare_age" || circuitName === "compare_age_evm") {
    return !hasQueryResultFalseValue(queryResult, "age", ["gte", "lt", "eq", "range"])
  }
  if (circuitName === "compare_birthdate" || circuitName === "compare_birthdate_evm") {
    return !hasQueryResultFalseValue(queryResult, "birthdate", ["gte", "gt", "lt", "lte", "range"])
  }
  if (circuitName === "compare_expiry" || circuitName === "compare_expiry_evm") {
    return !hasQueryResultFalseValue(queryResult, "expiry_date", [
      "gte",
      "gt",
      "lt",
      "lte",
      "range",
    ])
  }
  if (circuitName === "disclose_bytes" || circuitName === "disclose_bytes_evm") {
    return (
      !hasQueryResultFalseValue(queryResult, "birthdate", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "expiry_date", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "document_type", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "nationality", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "document_number", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "issuing_country", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "gender", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "firstname", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "lastname", ["eq"]) &&
      !hasQueryResultFalseValue(queryResult, "fullname", ["eq"])
    )
  }
  if (
    circuitName === "exclusion_check_issuing_country" ||
    circuitName === "exclusion_check_issuing_country_evm"
  ) {
    return !hasQueryResultFalseValue(queryResult, "issuing_country", ["out"])
  }
  if (
    circuitName === "exclusion_check_nationality" ||
    circuitName === "exclusion_check_nationality_evm"
  ) {
    return !hasQueryResultFalseValue(queryResult, "nationality", ["out"])
  }
  if (
    circuitName === "inclusion_check_issuing_country" ||
    circuitName === "inclusion_check_issuing_country_evm"
  ) {
    return !hasQueryResultFalseValue(queryResult, "issuing_country", ["in"])
  }
  if (
    circuitName === "inclusion_check_nationality" ||
    circuitName === "inclusion_check_nationality_evm"
  ) {
    return !hasQueryResultFalseValue(queryResult, "nationality", ["in"])
  }
  return true
}

export function getPassportFieldsFromQuery(query: Query, passport: PassportViewModel) {
  const fields = Object.keys(query).filter((key) =>
    hasRequestedAccessToField(query, key as IDCredential),
  )
  const results: QueryResult = {}
  for (const field of fields) {
    switch (field) {
      case "firstname":
        results.firstname = getQueryResultValue(query, "firstname", passport.firstName)
        break
      case "lastname":
        results.lastname = getQueryResultValue(query, "lastname", passport.lastName)
        break
      case "fullname":
        results.fullname = getQueryResultValue(query, "fullname", getFullName(passport))
        break
      case "birthdate":
        results.birthdate = getQueryResultValue(query, "birthdate", passport.dateOfBirth)
        break
      case "expiry_date":
        results.expiry_date = getQueryResultValue(query, "expiry_date", passport.passportExpiry)
        break
      case "nationality":
        results.nationality = getQueryResultValue(query, "nationality", passport.nationality)
        break
      case "age":
        results.age = getQueryResultValue(query, "age", getAge(passport.dateOfBirth))
        break
      case "document_number":
        results.document_number = getQueryResultValue(
          query,
          "document_number",
          passport.passportNumber,
        )
        break
      case "document_type":
        results.document_type = getQueryResultValue(
          query,
          "document_type",
          passport.mrz.slice(0, 2),
        )
        break
      case "issuing_country":
        results.issuing_country = getQueryResultValue(
          query,
          "issuing_country",
          passport.mrz.slice(2, 5),
        )
        break
      case "gender":
        results.gender = getQueryResultValue(query, "gender", passport.gender)
        break
    }
  }
  if (query.bind) {
    results.bind = {}
    if (query.bind.user_address) {
      results.bind.user_address = query.bind.user_address
    }
    if (query.bind.custom_data) {
      results.bind.custom_data = query.bind.custom_data
    }
  }
  return results
}
