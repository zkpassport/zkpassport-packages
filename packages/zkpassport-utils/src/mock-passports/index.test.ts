import { describe, expect, test } from "bun:test"
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js"
import rootCerts from "../../tests/fixtures/root-certs.json"
import { verifyDscSignature } from "../signature-verification"
import type { PackagedCertificate } from "../types"
import { getMockPassports } from "."

const HASHES: Record<string, (data: Uint8Array) => Uint8Array> = {
  SHA256: sha256,
  SHA384: sha384,
  SHA512: sha512,
}

const zkrCscas = (rootCerts.certificates as PackagedCertificate[]).filter(
  (certificate) => certificate.country === "ZKR",
)

describe("getMockPassports", () => {
  const passports = Object.entries(getMockPassports())

  test("builds the seven mock passports", () => {
    expect(passports.map(([name]) => name)).toEqual([
      "john",
      "mary",
      "jane",
      "jack",
      "paul",
      "stephanie",
      "misterSanctioned",
    ])
  })

  test.each(passports)("%s's DSC is signed by a ZKR CSCA", async (_, passport) => {
    const verifications = await Promise.all(
      zkrCscas.map((csca) => verifyDscSignature(passport.sod.certificate, csca)),
    )

    expect(verifications).toContain(true)
  })

  test.each(passports)("%s's DG1 hashes to the value its SOD signs", (_, passport) => {
    const dg1 = passport.dataGroups.find((group) => group.groupNumber === 1)!
    const hash = HASHES[passport.dataGroupsHashAlgorithm](new Uint8Array(dg1.value))

    expect(Array.from(hash)).toEqual(dg1.hash)
  })

  test.each(passports)("%s's fields match the MRZ", (_, passport) => {
    const { mrz } = passport

    expect(mrz.slice(5, 44)).toStartWith(
      `${passport.lastName.toUpperCase()}<<${passport.firstName.toUpperCase()}<`,
    )
    expect(mrz.slice(44, 53)).toBe(passport.passportNumber)
    expect(mrz.slice(54, 57)).toBe(passport.nationality)
    expect(mrz.slice(57, 63)).toBe(passport.dateOfBirth)
    expect(mrz.slice(64, 65)).toBe(passport.gender)
    expect(mrz.slice(65, 71)).toBe(passport.passportExpiry)
  })
})
