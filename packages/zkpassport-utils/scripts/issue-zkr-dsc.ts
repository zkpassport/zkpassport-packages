// Issues a ZKR DSC for a new mock passport signature, such as rsa-2048-sha384 or ecdsa-p384-sha256,
// and adds it to src/mock-passports/dscs.json. The signature then needs adding to
// MockPassportSignature and SIGNATURES in src/mock-passports/index.ts.
//
//   bun scripts/issue-zkr-dsc.ts <signature>
import { createPrivateKey, X509Certificate } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { sha256 } from "@noble/hashes/sha2.js"
import { AsnSerializer } from "@peculiar/asn1-schema"
import {
  type EcdsaCurve,
  generateCertificate,
  generateEcdsaKeyPair,
  generateRsaKeyPair,
  type HashAlgorithm,
  loadKeypairFromFile,
} from "../src/passport-generator"

const keyPairsDir = path.join(import.meta.dirname, "zkr", "keypairs")
const dscsFile = path.join(import.meta.dirname, "../src/mock-passports/dscs.json")

const CSCA_NAME = [
  { type: "2.5.4.3", value: "Zero Knowledge Republic CSCA" },
  { type: "2.5.4.6", value: "ZK" },
]
const DSC_NAME = [
  { type: "2.5.4.3", value: "Zero Knowledge Republic DSC" },
  { type: "2.5.4.6", value: "ZK" },
]

const CURVES: Record<string, EcdsaCurve> = { p256: "P-256", p384: "P-384", p521: "P-521" }

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function main() {
  const signature = process.argv[2]
  const match = signature?.match(/^(rsa|rsa-pss|ecdsa)-(\d+|p256|p384|p521)-sha(256|384|512)$/)
  if (!match) {
    throw new Error(
      "Usage: bun scripts/issue-zkr-dsc.ts <rsa|rsa-pss>-<bits>-sha<n> | ecdsa-<curve>-sha<n>",
    )
  }
  const [, scheme, key, hashBits] = match
  const hashAlgorithm = `SHA-${hashBits}` as HashAlgorithm

  const dscs: Record<string, { certificate: string; privateKey: string }> = JSON.parse(
    readFileSync(dscsFile, "utf-8"),
  )
  if (dscs[signature]) {
    throw new Error(`${signature} already has a DSC`)
  }

  const isRsa = scheme.startsWith("rsa")
  const csca = await loadKeypairFromFile(
    path.join(
      keyPairsDir,
      isRsa ? "zkr-csca-rsa-2048-sha256.json" : "zkr-csca-ecdsa-p256-sha256.json",
    ),
  )
  const keyPair = isRsa
    ? await generateRsaKeyPair(Number(key), hashAlgorithm)
    : await generateEcdsaKeyPair(CURVES[key])

  // Serial numbers count up from the existing DSCs'
  const serialNumber =
    Math.max(
      ...Object.values(dscs).map(({ certificate }) =>
        parseInt(new X509Certificate(Buffer.from(certificate, "base64")).serialNumber, 16),
      ),
    ) + 1

  const certificate = await generateCertificate({
    subject: DSC_NAME,
    issuer: CSCA_NAME,
    publicKey: keyPair.publicKey,
    signingKeyPair: csca,
    isCA: false,
    validityYears: 10,
    serialNumber: new Uint8Array([serialNumber]),
    subjectKeyIdentifier: sha256(keyPair.publicKey),
    authorityKeyIdentifier: sha256(csca.publicKey),
    // The CSCAs sign with SHA-256
    hashAlgorithm: "SHA-256",
  })
  const privateKey = createPrivateKey({
    key: Buffer.from(keyPair.privateKey),
    format: "der",
    type: "pkcs8",
  }).export({ format: "der", type: isRsa ? "pkcs1" : "sec1" })

  dscs[signature] = {
    certificate: Buffer.from(AsnSerializer.serialize(certificate)).toString("base64"),
    privateKey: privateKey.toString("base64"),
  }
  writeFileSync(dscsFile, `${JSON.stringify(dscs, null, 2)}\n`)
  console.log(`${signature}: DSC with serial ${serialNumber} added to ${dscsFile}`)
}
