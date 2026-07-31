import { sha256 } from "@noble/hashes/sha2.js"
import { Binary } from "./binary"
import { hasRequestedAccessToField, getMrzDisclosedNames, calculateAge } from "./circuit-matcher"
import { parseDocumentType, stripChevrons } from "./circuits/disclose"
import {
  getDocumentNumberRange,
  getGenderRange,
  getNationality,
  getBirthdateRange,
} from "./passport/getters"
import type {
  DisclosureWitness,
  EnrollmentBundle,
  IDCredential,
  IntegrityToDisclosureSalts,
  Query,
  QueryResult,
  QueryResultValue,
  SanctionsAlpha2Code,
} from "./types"
import { mrzFromDg1 } from "./utils"

/**
 * Derive a new salt from the private salt by hashing it.
 * This salt can then be used as a public salt for proof delegation
 * of some disclosure proofs such as FaceMatch.
 *
 * NOTE: this must remain byte-for-byte identical to the mobile app implementation
 * (including `salt.toString(16)` producing possibly odd-length hex, which
 * Buffer.from(..., "hex") silently truncates) since both sides must derive the
 * same integrity-to-disclosure salts.
 */
export function getPublicSalt(salt: bigint): bigint {
  const publicSalt = Binary.from(sha256(Buffer.from(salt.toString(16), "hex"))).toBigInt()
  return publicSalt
}

// BN254 scalar field modulus (the field all circuit values live in)
const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

/**
 * Use the public salt for all disclosure proofs so the commitments match.
 * But in practice only the FaceMatch disclosure proof will hide the inputs
 * using the private salt.
 *
 * The public salt is a raw sha256 output (256 bits) and can exceed the field
 * modulus. It is reduced mod p here: Poseidon and the circuits reduce inputs
 * mod p anyway (which is why the unreduced value works on mobile's proving
 * stack), but noir_js's ABI encoding strictly rejects over-modulus values, so
 * the canonical representation is required for browser proving. Reduction does
 * not change any commitment.
 */
export function getIntegrityToDisclosureSalts(salt: bigint): IntegrityToDisclosureSalts {
  const publicSalt = getPublicSalt(salt) % FIELD_MODULUS
  return {
    dg1Salt: BigInt(salt),
    dg2HashSalt: BigInt(publicSalt),
    expiryDateSalt: BigInt(publicSalt),
    privateNullifierSalt: BigInt(salt),
  }
}

const BASE_SUBPROOF_NAME_PREFIXES = ["sig_check_dsc", "sig_check_id_data", "data_check_integrity"]

function isHexString(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)
}

function isByteArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 255)
  )
}

/**
 * Structural validation of an enrollment bundle received over the bridge.
 */
export function validateEnrollmentBundle(value: unknown): value is EnrollmentBundle {
  if (typeof value !== "object" || value === null) return false
  const bundle = value as EnrollmentBundle
  if (bundle.version !== 1) return false
  if (typeof bundle.circuitVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(bundle.circuitVersion)) {
    return false
  }
  if (!isHexString(bundle.certificateRegistryRoot)) return false
  if (!Array.isArray(bundle.baseSubproofs) || bundle.baseSubproofs.length !== 3) return false
  for (let i = 0; i < BASE_SUBPROOF_NAME_PREFIXES.length; i++) {
    const proof = bundle.baseSubproofs[i]
    if (typeof proof !== "object" || proof === null) return false
    if (typeof proof.proof !== "string" || proof.proof.length === 0) return false
    if (typeof proof.name !== "string" || !proof.name.startsWith(BASE_SUBPROOF_NAME_PREFIXES[i])) {
      return false
    }
  }
  const witness = bundle.witness
  if (typeof witness !== "object" || witness === null) return false
  // DG1 is 93 bytes for TD3 passports and 95 bytes for TD1 ID cards
  if (!isByteArray(witness.dg1) || witness.dg1.length < 93 || witness.dg1.length > 95) return false
  if (!isByteArray(witness.dg2Hash) || witness.dg2Hash.length < 20 || witness.dg2Hash.length > 64) {
    return false
  }
  if (typeof witness.expiryDate !== "string" || witness.expiryDate.length !== 6) return false
  if (!isHexString(witness.privateNullifier)) return false
  if (!isHexString(witness.salt)) return false
  return true
}

function getMRZDate(date: string, thresholdYear: Date = new Date()): Date {
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

function getPassportExpiryDate(passportExpiry: string): Date {
  return getMRZDate(
    passportExpiry,
    new Date(new Date().getFullYear() + 30, new Date().getMonth(), new Date().getDate()),
  )
}

function capitalizeEveryWord(str: string): string {
  if (!str) return ""
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function formatDiscloseValue(field: IDCredential, value: string | number | Date): unknown {
  if (field === "document_type" && typeof value === "string") {
    return parseDocumentType(value)
  }
  if (field === "firstname" || field === "lastname" || field === "fullname") {
    return capitalizeEveryWord(value as string)
  }
  if (field === "expiry_date" || field === "birthdate") {
    if (value instanceof Date) {
      return value.toISOString()
    }
  }
  return value
}

function getQueryResultValue(
  query: Query,
  field: IDCredential,
  value: string | number | string[] | Date,
): QueryResultValue<IDCredential> | undefined {
  const queryField = query[field]
  const isValueDate = value instanceof Date
  const result: QueryResultValue<IDCredential> = {
    eq:
      queryField && queryField.eq
        ? {
            expected: queryField.eq,
            result: (() => {
              if (field === "document_type") {
                return queryField.eq === parseDocumentType(value as string)
              } else if (isValueDate) {
                const queryDate = new Date(queryField.eq)
                // Only compare the year, month and day
                return (
                  value.getFullYear() === queryDate.getFullYear() &&
                  value.getMonth() === queryDate.getMonth() &&
                  value.getDate() === queryDate.getDate()
                )
              } else if (typeof value === "string") {
                return value.toLowerCase().trim() === queryField.eq.toLowerCase().trim()
              } else if (typeof value === "number") {
                return value === queryField.eq
              } else if (Array.isArray(value)) {
                return (
                  value.sort().join(",").toLowerCase().trim() ===
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
              : value >= queryField.range[0] && value <= queryField.range[1],
          }
        : undefined,
    disclose: queryField?.disclose
      ? { result: formatDiscloseValue(field, value as string | number | Date) }
      : undefined,
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
  } as QueryResultValue<IDCredential>
  for (const key in result) {
    if (!result[key as keyof QueryResultValue<IDCredential>]) {
      delete result[key as keyof QueryResultValue<IDCredential>]
    }
  }
  return result
}

/**
 * Build the QueryResult (the `done` payload the mobile app normally sends) from the
 * disclosure witness. All values are MRZ-derivable; formatting mirrors the mobile app,
 * except document_type which follows the verifier's parseDocumentType so the result
 * always matches what PublicInputChecker validates against the disclosed bytes.
 */
export function buildQueryResultFromWitness(
  query: Query,
  witness: DisclosureWitness,
  opts: { sanctionsPassed?: boolean } = {},
): QueryResult {
  const mrz = mrzFromDg1(witness.dg1)
  const mrzSource = { mrz }
  const dateOfBirth = mrz.slice(...getBirthdateRange(mrzSource))
  const fields = Object.keys(query).filter((key) =>
    hasRequestedAccessToField(query, key as IDCredential),
  )
  // Source the disclosed name from the MRZ (the bytes the proof commits to) so the
  // disclosed value always matches what the verifier attests
  const names = getMrzDisclosedNames(mrzSource, query)
  const results: QueryResult = {}
  for (const field of fields) {
    switch (field) {
      case "firstname":
        results.firstname = getQueryResultValue(query, "firstname", names.firstName)
        break
      case "lastname":
        results.lastname = getQueryResultValue(query, "lastname", names.lastName)
        break
      case "fullname":
        results.fullname = getQueryResultValue(query, "fullname", names.fullName)
        break
      case "birthdate":
        results.birthdate = getQueryResultValue(query, "birthdate", getMRZDate(dateOfBirth))
        break
      case "expiry_date":
        results.expiry_date = getQueryResultValue(
          query,
          "expiry_date",
          getPassportExpiryDate(witness.expiryDate),
        )
        break
      case "nationality":
        results.nationality = getQueryResultValue(query, "nationality", getNationality(mrzSource))
        break
      case "age":
        results.age = getQueryResultValue(query, "age", calculateAge({ dateOfBirth }))
        break
      case "document_number":
        results.document_number = getQueryResultValue(
          query,
          "document_number",
          stripChevrons(mrz.slice(...getDocumentNumberRange(mrzSource))),
        )
        break
      case "document_type":
        results.document_type = getQueryResultValue(query, "document_type", mrz.slice(0, 2))
        break
      case "issuing_country":
        results.issuing_country = getQueryResultValue(
          query,
          "issuing_country",
          mrz.slice(2, 5) === "D<<" ? "DEU" : mrz.slice(2, 5),
        )
        break
      case "gender":
        results.gender = getQueryResultValue(
          query,
          "gender",
          mrz.slice(...getGenderRange(mrzSource)),
        )
        break
    }
  }
  if (query.bind) {
    results.bind = {}
    if (query.bind.user_address) {
      results.bind.user_address = query.bind.user_address
    }
    if (query.bind.chain) {
      results.bind.chain = query.bind.chain
    }
    if (query.bind.custom_data) {
      results.bind.custom_data = query.bind.custom_data
    }
  }
  if (query.sanctions) {
    const sanctionsPassed = opts.sanctionsPassed ?? false
    results.sanctions = {
      passed: sanctionsPassed,
      countries: {
        US: { passed: sanctionsPassed },
        GB: { passed: sanctionsPassed },
        EU: { passed: sanctionsPassed },
        CH: { passed: sanctionsPassed },
      } as Record<SanctionsAlpha2Code, { passed: boolean }>,
      lists: {
        US_OFAC_SDN: { passed: sanctionsPassed },
        CH_SECO_SANCTIONS: { passed: sanctionsPassed },
        EU_FSF_SANCTIONS: { passed: sanctionsPassed },
        GB_FCDO_SANCTIONS: { passed: sanctionsPassed },
      },
      isStrict: query.sanctions.strict ?? false,
    }
  }
  return results
}
