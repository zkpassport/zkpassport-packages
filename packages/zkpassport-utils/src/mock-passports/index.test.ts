import { describe, expect, test } from "bun:test"
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js"
import { ECParameters } from "@peculiar/asn1-ecc"
import { AsnConvert, AsnSerializer } from "@peculiar/asn1-schema"
import { TBSCertificate } from "@peculiar/asn1-x509"
import rootCerts from "../../tests/fixtures/root-certs.json"
import { getRSAPSSParams } from "../cms/utils"
import { verifyDscSignature } from "../signature-verification"
import type { PackagedCertificate, PassportViewModel } from "../types"
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

  test("builds the ten mock passports", () => {
    expect(passports.map(([name]) => name)).toEqual([
      "john",
      "mary",
      "jane",
      "jack",
      "paul",
      "stephanie",
      "misterSanctioned",
      "peter",
      "lucie",
      "mark",
    ])
  })

  test.each(passports)("%s's DSC is signed by a ZKR CSCA", async (_, passport) => {
    const verifications = await Promise.all(
      zkrCscas.map((csca) => verifyDscSignature(passport.sod.certificate, csca)),
    )

    expect(verifications).toContain(true)
  })

  test.each(passports)("%s's SOD is signed by its DSC", async (_, passport) => {
    expect(await verifySodSignature(passport)).toBe(true)
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

const EC_CURVES: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
}

/** Verify the SOD's signature over its signed attributes with the public key of its DSC */
async function verifySodSignature({ sod }: PassportViewModel) {
  const { subjectPublicKeyInfo } = AsnConvert.parse(
    sod.certificate.tbs.bytes.toUInt8Array(),
    TBSCertificate,
  )
  const publicKey = new Uint8Array(AsnSerializer.serialize(subjectPublicKeyInfo))
  const hash = sod.signerInfo.digestAlgorithm.replace("SHA", "SHA-")
  const signatureAlgorithm = sod.signerInfo.signatureAlgorithm.name.toLowerCase()
  const signature = new Uint8Array(sod.signerInfo.signature.toUInt8Array())
  const signedAttrs = new Uint8Array(sod.signerInfo.signedAttrs.bytes.toUInt8Array())

  if (signatureAlgorithm.includes("ecdsa")) {
    const namedCurve =
      EC_CURVES[
        AsnConvert.parse(subjectPublicKeyInfo.algorithm.parameters!, ECParameters).namedCurve!
      ]
    const key = await crypto.subtle.importKey(
      "spki",
      publicKey,
      { name: "ECDSA", namedCurve },
      false,
      ["verify"],
    )
    return crypto.subtle.verify({ name: "ECDSA", hash }, key, signature, signedAttrs)
  }

  if (signatureAlgorithm.includes("pss")) {
    const { saltLength } = getRSAPSSParams(
      new Uint8Array(sod.signerInfo.signatureAlgorithm.parameters!.toUInt8Array()),
    )
    const key = await crypto.subtle.importKey("spki", publicKey, { name: "RSA-PSS", hash }, false, [
      "verify",
    ])
    return crypto.subtle.verify({ name: "RSA-PSS", saltLength }, key, signature, signedAttrs)
  }

  const key = await crypto.subtle.importKey(
    "spki",
    publicKey,
    { name: "RSASSA-PKCS1-v1_5", hash },
    false,
    ["verify"],
  )
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signedAttrs)
}
