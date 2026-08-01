import { describe, expect, test } from "bun:test"
import { sha256 } from "@noble/hashes/sha2.js"
import { Binary } from "../src/binary"
import {
  getAgeCircuitInputs,
  getAgeCircuitInputsFromWitness,
  getBindCircuitInputs,
  getBindCircuitInputsFromWitness,
  getBirthdateCircuitInputs,
  getBirthdateCircuitInputsFromWitness,
  getDiscloseCircuitInputs,
  getDiscloseCircuitInputsFromWitness,
  getDisclosureWitness,
  getExpiryDateCircuitInputs,
  getExpiryDateCircuitInputsFromWitness,
  getIssuingCountryExclusionCircuitInputs,
  getIssuingCountryExclusionCircuitInputsFromWitness,
  getIssuingCountryInclusionCircuitInputs,
  getIssuingCountryInclusionCircuitInputsFromWitness,
  getNationalityExclusionCircuitInputs,
  getNationalityExclusionCircuitInputsFromWitness,
  getNationalityInclusionCircuitInputs,
  getNationalityInclusionCircuitInputsFromWitness,
  getRequiredDisclosureCircuitNames,
} from "../src/circuit-matcher"
import {
  buildQueryResultFromWitness,
  getIntegrityToDisclosureSalts,
  getPublicSalt,
  validateEnrollmentBundle,
} from "../src/enrollment"
import type { DisclosureWitness, Query } from "../src/types"
import { PASSPORTS } from "./fixtures/passports"

const SALT = 0x1234567890abcdef1234567890abcdef1234567890abcdef12345678n
const SALTS = getIntegrityToDisclosureSalts(SALT)
const SERVICE_SCOPE = 123456789n
const SERVICE_SUBSCOPE = 987654321n
const TIMESTAMP = 1786000000

const QUERY: Query = {
  firstname: { disclose: true },
  nationality: { eq: "ZKR", in: ["ZKR", "FRA"], out: ["USA", "PRK"] },
  issuing_country: { in: ["ZKR", "FRA"], out: ["USA", "PRK"] },
  age: { gte: 18 },
  birthdate: { lte: new Date("2010-01-01") },
  expiry_date: { gte: new Date("2026-01-01") },
  bind: { custom_data: "hello world" },
}

describe("salt derivation", () => {
  test("getPublicSalt preserves the odd-length hex truncation quirk", () => {
    // 0xabc stringifies to "abc" whose last nibble Buffer.from(..., "hex") drops,
    // so the hash input is the single byte 0xab
    const expected = Binary.from(sha256(new Uint8Array([0xab]))).toBigInt()
    expect(getPublicSalt(0xabcn)).toBe(expected)
  })

  test("getPublicSalt hashes the exact bytes of even-length hex salts", () => {
    const expected = Binary.from(sha256(new Uint8Array([0xab, 0xcd]))).toBigInt()
    expect(getPublicSalt(0xabcdn)).toBe(expected)
  })

  test("getIntegrityToDisclosureSalts derives all four salts from the single salt", () => {
    const FIELD_MODULUS =
      21888242871839275222246405745257275088548364400416034343698204186575808495617n
    const salts = getIntegrityToDisclosureSalts(SALT)
    expect(salts.dg1Salt).toBe(SALT)
    expect(salts.privateNullifierSalt).toBe(SALT)
    // The public salt is reduced mod p so it is always a canonical field element
    // (noir_js rejects over-modulus values; Poseidon/circuits reduce anyway)
    expect(salts.dg2HashSalt).toBe(getPublicSalt(SALT) % FIELD_MODULUS)
    expect(salts.expiryDateSalt).toBe(getPublicSalt(SALT) % FIELD_MODULUS)
    expect(salts.dg2HashSalt < FIELD_MODULUS).toBe(true)
  })

  test("public salt exceeding the field modulus is reduced", () => {
    // Find deterministically that this specific salt produces an over-modulus sha256
    // (the one observed in the wild: dg2HashSalt must always be < p)
    const FIELD_MODULUS =
      21888242871839275222246405745257275088548364400416034343698204186575808495617n
    for (let i = 0n; i < 50n; i++) {
      const salts = getIntegrityToDisclosureSalts(SALT + i)
      expect(salts.dg2HashSalt < FIELD_MODULUS).toBe(true)
      expect(salts.expiryDateSalt < FIELD_MODULUS).toBe(true)
    }
  })
})

describe("disclosure witness", () => {
  for (const [name, passport] of Object.entries(PASSPORTS)) {
    test(`getDisclosureWitness extracts unpadded values (${name})`, async () => {
      const witness = await getDisclosureWitness(passport, SALT)
      expect(witness).not.toBeNull()
      const dg1 = passport.dataGroups.find((dg) => dg.groupNumber === 1)!
      expect(witness!.dg1).toEqual(dg1.value)
      expect(witness!.dg1.length).toBeLessThanOrEqual(95)
      expect(witness!.expiryDate).toBe(passport.passportExpiry)
      expect(witness!.privateNullifier.startsWith("0x")).toBe(true)
      expect(witness!.salt).toBe(`0x${SALT.toString(16)}`)
    })
  }
})

describe("witness-based input builders match passport-based builders", () => {
  const builderPairs: [
    string,
    (passport: any) => Promise<any>,
    (witness: DisclosureWitness) => Promise<any>,
  ][] = [
    [
      "disclose_bytes",
      (p) =>
        getDiscloseCircuitInputs(p, QUERY, SALTS, 0n, SERVICE_SCOPE, SERVICE_SUBSCOPE, TIMESTAMP),
      (w) =>
        getDiscloseCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
    [
      "compare_age",
      (p) => getAgeCircuitInputs(p, QUERY, SALTS, 0n, SERVICE_SCOPE, SERVICE_SUBSCOPE, TIMESTAMP),
      (w) =>
        getAgeCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
    [
      "compare_birthdate",
      (p) =>
        getBirthdateCircuitInputs(p, QUERY, SALTS, 0n, SERVICE_SCOPE, SERVICE_SUBSCOPE, TIMESTAMP),
      (w) =>
        getBirthdateCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
    [
      "compare_expiry",
      (p) =>
        getExpiryDateCircuitInputs(p, QUERY, SALTS, 0n, SERVICE_SCOPE, SERVICE_SUBSCOPE, TIMESTAMP),
      (w) =>
        getExpiryDateCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
    [
      "inclusion_check_nationality",
      (p) =>
        getNationalityInclusionCircuitInputs(
          p,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
      (w) =>
        getNationalityInclusionCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
    [
      "exclusion_check_nationality",
      (p) =>
        getNationalityExclusionCircuitInputs(
          p,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
      (w) =>
        getNationalityExclusionCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
    [
      "inclusion_check_issuing_country",
      (p) =>
        getIssuingCountryInclusionCircuitInputs(
          p,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
      (w) =>
        getIssuingCountryInclusionCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
    [
      "exclusion_check_issuing_country",
      (p) =>
        getIssuingCountryExclusionCircuitInputs(
          p,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
      (w) =>
        getIssuingCountryExclusionCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
    [
      "bind",
      (p) => getBindCircuitInputs(p, QUERY, SALTS, 0n, SERVICE_SCOPE, SERVICE_SUBSCOPE, TIMESTAMP),
      (w) =>
        getBindCircuitInputsFromWitness(
          w,
          QUERY,
          SALTS,
          0n,
          SERVICE_SCOPE,
          SERVICE_SUBSCOPE,
          TIMESTAMP,
        ),
    ],
  ]

  for (const [passportName, passport] of Object.entries(PASSPORTS)) {
    for (const [circuitName, fromPassport, fromWitness] of builderPairs) {
      test(`${circuitName} (${passportName})`, async () => {
        const witness = await getDisclosureWitness(passport, SALT)
        expect(witness).not.toBeNull()
        const expected = await fromPassport(passport)
        const actual = await fromWitness(witness!)
        expect(expected).not.toBeNull()
        expect(actual).toEqual(expected)
      })
    }
  }
})

describe("getRequiredDisclosureCircuitNames", () => {
  test("selects the right circuits for a mixed query", () => {
    const names = getRequiredDisclosureCircuitNames(QUERY)
    expect(names.sort()).toEqual(
      [
        "disclose_bytes",
        "compare_age",
        "compare_birthdate",
        "compare_expiry",
        "inclusion_check_nationality",
        "exclusion_check_nationality",
        "inclusion_check_issuing_country",
        "exclusion_check_issuing_country",
        "bind",
      ].sort(),
    )
  })

  test("empty query falls back to disclose_bytes", () => {
    expect(getRequiredDisclosureCircuitNames({})).toEqual(["disclose_bytes"])
  })

  test("facematch-only query adds disclose_bytes", () => {
    const names = getRequiredDisclosureCircuitNames({ facematch: { mode: "regular" } })
    expect(names.sort()).toEqual(["disclose_bytes", "facematch"].sort())
  })

  test("age eq maps to compare_age, expiry eq maps to compare_expiry", () => {
    expect(getRequiredDisclosureCircuitNames({ age: { eq: 21 } })).toEqual(["compare_age"])
    expect(getRequiredDisclosureCircuitNames({ expiry_date: { eq: new Date() } })).toEqual([
      "compare_expiry",
    ])
    expect(getRequiredDisclosureCircuitNames({ birthdate: { eq: new Date() } })).toEqual([
      "compare_birthdate",
    ])
  })

  test("expiry/birthdate disclose maps to disclose_bytes", () => {
    expect(getRequiredDisclosureCircuitNames({ expiry_date: { disclose: true } })).toEqual([
      "disclose_bytes",
    ])
    expect(getRequiredDisclosureCircuitNames({ birthdate: { disclose: true } })).toEqual([
      "disclose_bytes",
    ])
  })

  test("sanctions query maps to exclusion_check_sanctions", () => {
    expect(getRequiredDisclosureCircuitNames({ sanctions: {} })).toEqual([
      "exclusion_check_sanctions",
    ])
  })

  test("evm variants", () => {
    expect(getRequiredDisclosureCircuitNames({ age: { gte: 18 } }, true)).toEqual([
      "compare_age_evm",
    ])
  })
})

describe("buildQueryResultFromWitness", () => {
  test("builds the expected result for john", async () => {
    const passport = PASSPORTS.john
    const witness = (await getDisclosureWitness(passport, SALT))!
    const result = buildQueryResultFromWitness(QUERY, witness)
    expect(result.firstname?.disclose?.result).toBe("John")
    expect(result.age?.gte?.result).toBe(true)
    expect(result.age?.gte?.expected).toBe(18)
    expect(result.nationality?.eq?.result).toBe(true)
    expect(result.nationality?.in?.result).toBe(true)
    expect(result.nationality?.out?.result).toBe(true)
    expect(result.issuing_country?.in?.result).toBe(true)
    expect(result.issuing_country?.out?.result).toBe(true)
    // Born 1995-11-12, well before 2010-01-01
    expect(result.birthdate?.lte?.result).toBe(true)
    // Expires 2035-01-01, after 2026-01-01
    expect(result.expiry_date?.gte?.result).toBe(true)
    expect(result.bind?.custom_data).toBe("hello world")
  })

  test("document fields derive from the MRZ", async () => {
    const passport = PASSPORTS.mary
    const witness = (await getDisclosureWitness(passport, SALT))!
    const result = buildQueryResultFromWitness(
      {
        document_type: { disclose: true },
        document_number: { disclose: true },
        gender: { disclose: true },
      },
      witness,
    )
    expect(result.document_type?.disclose?.result).toBe("passport")
    expect(result.document_number?.disclose?.result).toBe(passport.passportNumber)
    expect(result.gender?.disclose?.result).toBe("F")
  })
})

describe("validateEnrollmentBundle", () => {
  const validBundle = async () => ({
    version: 1 as const,
    circuitVersion: "0.20.0" as const,
    certificateRegistryRoot: "0x1234abcd",
    baseSubproofs: [
      { name: "sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256", proof: "abcd", vkeyHash: "0x1" },
      { name: "sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256", proof: "abcd", vkeyHash: "0x2" },
      { name: "data_check_integrity_sa_sha256_dg_sha256", proof: "abcd", vkeyHash: "0x3" },
    ],
    witness: (await getDisclosureWitness(PASSPORTS.john, SALT))!,
  })

  test("accepts a valid bundle", async () => {
    expect(validateEnrollmentBundle(await validBundle())).toBe(true)
  })

  test("rejects invalid bundles", async () => {
    expect(validateEnrollmentBundle(null)).toBe(false)
    expect(validateEnrollmentBundle({})).toBe(false)
    expect(validateEnrollmentBundle({ ...(await validBundle()), version: 2 })).toBe(false)
    expect(
      validateEnrollmentBundle({ ...(await validBundle()), certificateRegistryRoot: "nope" }),
    ).toBe(false)
    const wrongOrder = await validBundle()
    wrongOrder.baseSubproofs.reverse()
    expect(validateEnrollmentBundle(wrongOrder)).toBe(false)
    const badWitness = await validBundle()
    badWitness.witness = { ...badWitness.witness, dg1: badWitness.witness.dg1.slice(0, 10) }
    expect(validateEnrollmentBundle(badWitness)).toBe(false)
    const badSalt = await validBundle()
    badSalt.witness = { ...badSalt.witness, salt: "not-hex" }
    expect(validateEnrollmentBundle(badSalt)).toBe(false)
  })
})
