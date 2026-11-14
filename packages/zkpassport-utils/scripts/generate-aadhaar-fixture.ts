/**
 * Writes the aadhaar_id test fixture the circuits repo proves: a V2 Secure QR code signed by a
 * throwaway RSA-2048 key, a Certificate Registry holding that key as a UIDAI certificate, the
 * circuit inputs and the outputs the circuit must give.
 *
 *   bun scripts/generate-aadhaar-fixture.ts <circuits repo>/src/ts/tests/fixtures/aadhaar.json
 */
import { createSign, generateKeyPairSync } from "crypto"
import { writeFileSync } from "fs"
import {
  aadhaarToDg1,
  aadhaarToPassportViewModel,
  buildAadhaarSignedData,
  calculateAadhaarCommitment,
  getAadhaarCircuitInputs,
  getAadhaarPhotoHash,
  parseAadhaarData,
} from "../src/circuits/aadhaar"
import { normalizeDg2Hash } from "../src/circuits"
import { createPackagedCertificatesFile, PACKAGED_CERT_TYPE_UIDAI } from "../src/registry"

async function main() {
  const output = process.argv[2]
  if (!output) throw new Error("Usage: generate-aadhaar-fixture.ts <output.json>")

  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const modulus = Buffer.from(publicKey.export({ format: "jwk" }).n!, "base64url").toString("hex")
  const photo = new Uint8Array([0xff, 0x4f, 0xff, 0x51, 0x00, 0x2f, 0x01, 0x02])
  const signedData = buildAadhaarSignedData(
    {
      aadhaarLastDigits: "1234",
      signedAt: "20260315123045678",
      name: "Rahul Kumar Sharma",
      dateOfBirth: "15-08-1990",
      gender: "M",
      mobileLastDigits: "5678",
    },
    photo,
  )
  const signature = new Uint8Array(createSign("SHA256").update(signedData).sign(privateKey))

  const uidaiCert = {
    country: "IND",
    signature_algorithm: "RSA" as const,
    public_key: { type: "RSA" as const, modulus: `0x${modulus}`, exponent: 65537, key_size: 2048 },
    validity: { not_before: 1770112572, not_after: 1864634916 },
    fingerprint: `0x${"11".repeat(31)}`,
    tags: ["IN" as const],
    type: PACKAGED_CERT_TYPE_UIDAI,
  }
  const cscaCert = {
    ...uidaiCert,
    public_key: { ...uidaiCert.public_key, modulus: `0x${"c5".repeat(256)}` },
    fingerprint: `0x${"22".repeat(31)}`,
    tags: ["UN" as const],
    type: undefined,
  }
  const packagedCerts = await createPackagedCertificatesFile({
    timestamp: 1777479919,
    certificates: [cscaCert, uidaiCert],
    masterlists: [],
  })

  const salts = { dg1Salt: 11n, expiryDateSalt: 12n, dg2HashSalt: 13n, privateNullifierSalt: 14n }
  const passport = aadhaarToPassportViewModel({ signedData, signature }, modulus)
  const inputs = await getAadhaarCircuitInputs(passport, salts, packagedCerts)
  const aadhaar = parseAadhaarData(signedData)
  const { commitment, privateNullifier } = await calculateAadhaarCommitment(salts, aadhaar)

  writeFileSync(
    output,
    `${JSON.stringify(
      {
        inputs,
        dg1: Array.from(aadhaarToDg1(aadhaar)),
        photoHashNormalized: `0x${(await normalizeDg2Hash(getAadhaarPhotoHash(aadhaar))).toString(16)}`,
        privateNullifier: `0x${privateNullifier.toString(16)}`,
        commOut: `0x${commitment.toString(16)}`,
        certificateRegistryRoot: packagedCerts.root,
      },
      null,
      2,
    )}\n`,
  )
  console.log(`Wrote ${output} (registry root ${packagedCerts.root})`)
}

main()
