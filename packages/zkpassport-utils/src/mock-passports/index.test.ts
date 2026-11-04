import { describe, expect, test } from "bun:test"
import { sha256, sha384, sha512 } from "@noble/hashes/sha2.js"
import { ECParameters, id_ecPublicKey } from "@peculiar/asn1-ecc"
import { RSAPublicKey } from "@peculiar/asn1-rsa"
import { AsnConvert, AsnSerializer } from "@peculiar/asn1-schema"
import { TBSCertificate } from "@peculiar/asn1-x509"
import rootCerts from "../../tests/fixtures/root-certs.json"
import { getRSAPSSParams } from "../cms/utils"
import { verifyDscSignature } from "../signature-verification"
import type { PackagedCertificate, PassportViewModel } from "../types"
import { createMockPassport, type MockPassportSignature } from "."

const HASHES: Record<string, (data: Uint8Array) => Uint8Array> = {
  SHA256: sha256,
  SHA384: sha384,
  SHA512: sha512,
}

const EC_CURVES: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
}

const zkrCscas = (rootCerts.certificates as PackagedCertificate[]).filter(
  (certificate) => certificate.country === "ZKR",
)

const SIGNATURES: [MockPassportSignature, string][] = [
  ["rsa-2048-sha256", "RSA 2048"],
  ["rsa-3072-sha384", "RSA 3072"],
  ["rsa-4096-sha512", "RSA 4096"],
  ["rsa-pss-4096-sha512", "RSA 4096"],
  ["ecdsa-p256-sha256", "P-256"],
  ["ecdsa-p384-sha384", "P-384"],
  ["ecdsa-p521-sha512", "P-521"],
]

describe("createMockPassport", () => {
  test("builds John Miller Smith's passport by default", () => {
    const passport = createMockPassport()

    expect(passport.mrz).toBe(
      "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<",
    )
    expect(passport).toMatchObject({
      name: "John Smith",
      fullName: "John Miller Smith",
      firstName: "John",
      lastName: "Smith",
      gender: "M",
      nationality: "ZKR",
      dateOfBirth: "951112",
      passportNumber: "ZP1111111",
      passportExpiry: "350101",
    })
  })

  test("puts the options in the MRZ", () => {
    const passport = createMockPassport({
      firstName: "Mister",
      middleName: "",
      lastName: "Sanctioned",
      gender: "F",
      nationality: "FRA",
      dateOfBirth: new Date("2012-02-25"),
      expiryDate: new Date("2024-01-01"),
      documentNumber: "AB123",
    })

    expect(passport.mrz).toBe(
      "P<ZKRSANCTIONED<<MISTER<<<<<<<<<<<<<<<<<<<<<AB123<<<<_FRA120225_F240101_<<<<<<<<<<<<<<<<",
    )
    expect(passport).toMatchObject({
      name: "Mister Sanctioned",
      fullName: "Mister Sanctioned",
      nationality: "FRA",
      dateOfBirth: "120225",
      passportNumber: "AB123",
      passportExpiry: "240101",
    })
  })

  test("rejects names that don't fit the MRZ", () => {
    expect(() => createMockPassport({ lastName: "Smith".repeat(8) })).toThrow("longer than")
    expect(() => createMockPassport({ firstName: "Zoë" })).toThrow("characters")
  })

  test("signs DG1's hash", () => {
    const passport = createMockPassport()
    const dg1 = passport.dataGroups.find((group) => group.groupNumber === 1)!
    const hash = HASHES[passport.dataGroupsHashAlgorithm](new Uint8Array(dg1.value))

    expect(Array.from(hash)).toEqual(dg1.hash)
  })

  test.each(SIGNATURES)(
    "with %s, signs with a %s DSC that a ZKR CSCA signed",
    async (signature, key) => {
      const passport = createMockPassport({ signature })
      const verifications = await Promise.all(
        zkrCscas.map((csca) => verifyDscSignature(passport.sod.certificate, csca)),
      )

      expect(getDscKey(passport)).toBe(key)
      expect(await verifySodSignature(passport)).toBe(true)
      expect(verifications).toContain(true)
    },
  )

  test.each(SIGNATURES)("with %s, gives the same SOD for the same options", (signature) => {
    const options = { firstName: "Jane", signature }
    const first = createMockPassport(options)
    const second = createMockPassport(options)

    expect(first.sod.bytes.toHex()).toBe(second.sod.bytes.toHex())
  })
})

function getDscKey({ sod }: PassportViewModel) {
  const { subjectPublicKeyInfo } = AsnConvert.parse(
    sod.certificate.tbs.bytes.toUInt8Array(),
    TBSCertificate,
  )
  const { algorithm, parameters } = subjectPublicKeyInfo.algorithm
  if (algorithm === id_ecPublicKey) {
    return EC_CURVES[AsnConvert.parse(parameters!, ECParameters).namedCurve!]
  }
  const { modulus } = AsnConvert.parse(subjectPublicKeyInfo.subjectPublicKey, RSAPublicKey)
  const modulusBytes = new Uint8Array(modulus)
  return `RSA ${(modulusBytes[0] === 0 ? modulusBytes.length - 1 : modulusBytes.length) * 8}`
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
    const { parameters } = subjectPublicKeyInfo.algorithm
    const namedCurve = EC_CURVES[AsnConvert.parse(parameters!, ECParameters).namedCurve!]
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
