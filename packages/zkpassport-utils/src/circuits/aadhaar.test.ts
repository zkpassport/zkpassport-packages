import { describe, expect, test } from "bun:test"
import { createSign, generateKeyPairSync } from "crypto"
import { sha256 } from "@noble/hashes/sha2.js"
import {
  aadhaarNameToMrz,
  aadhaarToDg1,
  aadhaarToMrz,
  aadhaarToPassportViewModel,
  buildAadhaarSignedData,
  calculateAadhaarCommitment,
  decodeAadhaarQr,
  encodeAadhaarQr,
  findUidaiPublicKey,
  getAadhaarCircuitInputs,
  getUidaiPublicKeys,
  parseAadhaarData,
  verifyAadhaarSignature,
} from "./aadhaar"
import { mrzCheckDigit } from "../passport/td1"
import { CredentialScheme, PackagedCertificate } from "../types"
import { getNumberOfPublicInputs } from "./index"
import {
  buildMerkleTreeFromCerts,
  CERT_TYPE_CSCA,
  CERT_TYPE_UIDAI,
  createPackagedCertificatesFile,
  getCertificateLeafHash,
  getCertificateType,
  isCscaCertificate,
  PACKAGED_CERT_TYPE_UIDAI,
} from "../registry"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const MODULUS = Buffer.from(publicKey.export({ format: "jwk" }).n!, "base64url").toString("hex")
const PHOTO = new Uint8Array([0xff, 0x4f, 0xff, 0x51, 0x00, 0x2f, 0x01, 0x02])

const rsaCert = (modulus: string, extra: Partial<PackagedCertificate>): PackagedCertificate => ({
  country: "IND",
  signature_algorithm: "RSA",
  public_key: { type: "RSA", modulus: `0x${modulus}`, exponent: 65537, key_size: 2048 },
  validity: { not_before: 1770112572, not_after: 1864634916 },
  fingerprint: `0x${"11".repeat(31)}`,
  ...extra,
})
const UIDAI_CERT = rsaCert(MODULUS, { type: PACKAGED_CERT_TYPE_UIDAI, tags: ["IN"] })
const INDIAN_CSCA = rsaCert("c5".repeat(256), { fingerprint: `0x${"22".repeat(31)}`, tags: ["UN"] })
const packagedCerts = () =>
  createPackagedCertificatesFile({
    timestamp: 1777479919,
    certificates: [INDIAN_CSCA, UIDAI_CERT],
    masterlists: [],
  })

const sign = (data: Uint8Array) =>
  new Uint8Array(createSign("SHA256").update(data).sign(privateKey))

const SIGNED_DATA = buildAadhaarSignedData(
  {
    aadhaarLastDigits: "1234",
    signedAt: "20260315123045678",
    name: "Rahul Kumar Sharma",
    dateOfBirth: "15-08-1990",
    gender: "M",
    mobileLastDigits: "5678",
  },
  PHOTO,
)

describe("aadhaar", () => {
  test("decodes a QR code's decimal text to its signed data and signature", async () => {
    const signature = sign(SIGNED_DATA)
    const qr = decodeAadhaarQr(await encodeAadhaarQr(SIGNED_DATA, signature))
    expect(qr.signedData).toEqual(SIGNED_DATA)
    expect(qr.signature).toEqual(signature)
    expect(verifyAadhaarSignature(qr, MODULUS)).toBe(true)
    expect(findUidaiPublicKey(qr, [])).toBeUndefined()
    expect(findUidaiPublicKey(qr, getUidaiPublicKeys(await packagedCerts()))?.modulus).toBe(MODULUS)
  })

  test("rejects a tampered QR code", () => {
    const tampered = new Uint8Array(SIGNED_DATA)
    tampered[10] ^= 1
    expect(
      verifyAadhaarSignature({ signedData: tampered, signature: sign(SIGNED_DATA) }, MODULUS),
    ).toBe(false)
  })

  test("rejects text that is not a Secure QR code", () => {
    expect(() => decodeAadhaarQr("https://example.com")).toThrow("Not an Aadhaar Secure QR code")
    expect(() => decodeAadhaarQr("12345")).toThrow("Not an Aadhaar Secure QR code")
  })

  test("parses V2 fields and the photo", () => {
    const data = parseAadhaarData(SIGNED_DATA)
    expect(data.version).toBe(2)
    expect(data.aadhaarLastDigits).toBe("1234")
    expect(data.signedAt).toBe("20260315123045678")
    expect(data.name).toBe("Rahul Kumar Sharma")
    expect(data.dateOfBirth).toBe("15-08-1990")
    expect(data.mobileLastDigits).toBe("5678")
    expect(data.photo).toEqual(PHOTO)
  })

  test("builds the MRZ the circuit builds, with valid check digits", () => {
    const mrz = aadhaarToMrz(parseAadhaarData(SIGNED_DATA))
    expect(mrz).toHaveLength(88)
    expect(mrz.slice(0, 44)).toBe("IDINDRAHUL<KUMAR<SHARMA<<<<<<<<<<<<<<<<<<<<<")
    expect(mrz.slice(44, 54)).toBe(`XXXXX1234${mrzCheckDigit("XXXXX1234")}`)
    expect(mrz.slice(54, 57)).toBe("XXX")
    expect(mrz.slice(57, 64)).toBe("9008157")
    expect(mrz.charAt(64)).toBe("M")
    expect(mrz.slice(65, 71)).toBe("360315")
    expect(aadhaarNameToMrz(" S. R. O'Neil-Kumar")).toBe("S<R<ONEIL<KUMAR".padEnd(39, "<"))
  })

  test("keeps an Aadhaar as an ID whose base proof is aadhaar_id", async () => {
    const signature = sign(SIGNED_DATA)
    const passport = aadhaarToPassportViewModel({ signedData: SIGNED_DATA, signature }, MODULUS)
    expect(passport.credentialScheme).toBe(CredentialScheme.UIDAI_AADHAAR)
    expect(passport.dateOfBirth).toBe("900815")
    expect(passport.passportExpiry).toBe("360315")
    expect(passport.dataGroups[0].value).toEqual(
      Array.from(aadhaarToDg1(parseAadhaarData(SIGNED_DATA)).subarray(0, 93)),
    )
    expect(passport.dataGroups[1].hash).toEqual(Array.from(sha256(PHOTO)))

    const salts = { dg1Salt: 1n, expiryDateSalt: 2n, dg2HashSalt: 3n, privateNullifierSalt: 4n }
    const certs = await packagedCerts()
    const inputs = await getAadhaarCircuitInputs(passport, salts, certs)
    expect(inputs.qr_data).toHaveLength(2048)
    expect(inputs.qr_data_length).toBe(SIGNED_DATA.length)
    expect(inputs.pubkey_redc_param).toHaveLength(257)
    expect(inputs.delimiter_indices).toHaveLength(18)
    expect(inputs.uidai_cert_expiry).toBe(UIDAI_CERT.validity.not_after)
    expect(inputs.certificate_tree_hash_path).toHaveLength(16)
    // The path leads from the UIDAI leaf to the certificate tree's root
    let node = await getCertificateLeafHash(UIDAI_CERT, { version: 1 })
    for (let level = 0; level < 16; level++) {
      const sibling = BigInt(inputs.certificate_tree_hash_path[level])
      node = await poseidon2HashAsync(
        (inputs.certificate_tree_index >> level) & 1 ? [sibling, node] : [node, sibling],
      )
    }
    expect(node).toBe(BigInt((await buildMerkleTreeFromCerts(certs.certificates, 1)).root))
    expect(inputs.certificate_registry_root).toBe(certs.root)

    const { commitment, privateNullifier } = await calculateAadhaarCommitment(
      salts,
      parseAadhaarData(SIGNED_DATA),
    )
    expect(commitment).toBeGreaterThan(0n)
    // A new QR code of the same person keeps the nullifier
    const later = buildAadhaarSignedData(
      {
        aadhaarLastDigits: "1234",
        signedAt: "20270101000000000",
        name: "Rahul Kumar Sharma",
        dateOfBirth: "15-08-1990",
        gender: "M",
      },
      PHOTO,
    )
    const laterCommitment = await calculateAadhaarCommitment(salts, parseAadhaarData(later))
    expect(laterCommitment.privateNullifier).toEqual(privateNullifier)
  })

  test("refuses a key that is not in the Certificate Registry", async () => {
    const passport = aadhaarToPassportViewModel(
      { signedData: SIGNED_DATA, signature: sign(SIGNED_DATA) },
      "ab".repeat(256),
    )
    const salts = { dg1Salt: 1n, expiryDateSalt: 2n, dg2HashSalt: 3n, privateNullifierSalt: 4n }
    await expect(getAadhaarCircuitInputs(passport, salts, await packagedCerts())).rejects.toThrow(
      "The UIDAI key is not in the Certificate Registry",
    )
  })

  test("keeps UIDAI certificates apart from CSCAs", async () => {
    expect(getCertificateType(UIDAI_CERT)).toBe(CERT_TYPE_UIDAI)
    expect(getCertificateType(INDIAN_CSCA)).toBe(CERT_TYPE_CSCA)
    expect(isCscaCertificate(UIDAI_CERT)).toBe(false)
    expect(await getCertificateLeafHash(UIDAI_CERT, { version: 1 })).not.toBe(
      await getCertificateLeafHash({ ...UIDAI_CERT, type: undefined }, { version: 1 }),
    )
    expect(getUidaiPublicKeys(await packagedCerts())).toEqual([
      {
        name: UIDAI_CERT.fingerprint!,
        modulus: MODULUS,
        validFrom: "2026-02-03",
        validTo: "2029-02-01",
      },
    ])
    expect(getNumberOfPublicInputs("aadhaar_id", "0.23.0")).toBe(3)
  })
})
