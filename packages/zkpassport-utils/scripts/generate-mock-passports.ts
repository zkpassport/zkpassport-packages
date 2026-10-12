import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { sha256 } from "@noble/hashes/sha2.js"
import { id_ecdsaWithSHA256, id_ecdsaWithSHA384, id_ecdsaWithSHA512 } from "@peculiar/asn1-ecc"
import {
  id_sha256WithRSAEncryption,
  id_sha384WithRSAEncryption,
  id_sha512WithRSAEncryption,
} from "@peculiar/asn1-rsa"
import { AsnSerializer } from "@peculiar/asn1-schema"
import { AlgorithmIdentifier, Certificate } from "@peculiar/asn1-x509"
import { PemConverter } from "@peculiar/x509"
import { Binary } from "../src/binary"
import { getMockPassports, type MockPassportName } from "../src/mock-passports"
import {
  type EcdsaCurve,
  generateCertificate,
  generateEcdsaKeyPair,
  generateRsaKeyPair,
  generateSod,
  type HashAlgorithm,
  type KeyPair,
  loadKeypairFromFile,
  saveKeypairToFile,
  signSod,
  wrapSodInContentInfo,
} from "../src/passport-generator"

type CertificateSpec = {
  file: string
  key: { type: "RSA"; size: number } | { type: "ECDSA"; curve: EcdsaCurve }
  hashAlgorithm: HashAlgorithm
  serialNumber: number
}

type DscSpec = CertificateSpec & { csca: CertificateSpec }

type IssuedCertificate = { certificate: Certificate; keyPair: KeyPair }

const certificatesDir = path.join(import.meta.dirname, "zkr")
const keyPairsDir = path.join(certificatesDir, "keypairs")
const sodsDir = path.join(import.meta.dirname, "../src/mock-passports/sods")

const CSCA_NAME = [
  { type: "2.5.4.3", value: "Zero Knowledge Republic CSCA" },
  { type: "2.5.4.6", value: "ZK" },
]
const DSC_NAME = [
  { type: "2.5.4.3", value: "Zero Knowledge Republic DSC" },
  { type: "2.5.4.6", value: "ZK" },
]

const RSA_CSCA: CertificateSpec = {
  file: "zkr-csca-rsa-2048-sha256",
  key: { type: "RSA", size: 2048 },
  hashAlgorithm: "SHA-256",
  serialNumber: 0x01,
}
const ECDSA_CSCA: CertificateSpec = {
  file: "zkr-csca-ecdsa-p256-sha256",
  key: { type: "ECDSA", curve: "P-256" },
  hashAlgorithm: "SHA-256",
  serialNumber: 0x05,
}

const DSCS = {
  rsa2048: {
    csca: RSA_CSCA,
    file: "zkr-dsc-rsa-2048-sha256",
    key: { type: "RSA", size: 2048 },
    hashAlgorithm: "SHA-256",
    serialNumber: 0x02,
  },
  rsa3072: {
    csca: RSA_CSCA,
    file: "zkr-dsc-rsa-3072-sha384",
    key: { type: "RSA", size: 3072 },
    hashAlgorithm: "SHA-384",
    serialNumber: 0x03,
  },
  rsa4096: {
    csca: RSA_CSCA,
    file: "zkr-dsc-rsa-4096-sha512",
    key: { type: "RSA", size: 4096 },
    hashAlgorithm: "SHA-512",
    serialNumber: 0x04,
  },
  p256: {
    csca: ECDSA_CSCA,
    file: "zkr-dsc-ecdsa-p256-sha256",
    key: { type: "ECDSA", curve: "P-256" },
    hashAlgorithm: "SHA-256",
    serialNumber: 0x06,
  },
  p384: {
    csca: ECDSA_CSCA,
    file: "zkr-dsc-ecdsa-p384-sha384",
    key: { type: "ECDSA", curve: "P-384" },
    hashAlgorithm: "SHA-384",
    serialNumber: 0x07,
  },
  p521: {
    csca: ECDSA_CSCA,
    file: "zkr-dsc-ecdsa-p521-sha512",
    key: { type: "ECDSA", curve: "P-521" },
    hashAlgorithm: "SHA-512",
    serialNumber: 0x08,
  },
} satisfies Record<string, DscSpec>

const SODS: Record<MockPassportName, { file: string; dsc: DscSpec; signatureAlgorithm: string }> = {
  john: {
    file: "john-miller-smith-rsa-2048-sha256.json",
    dsc: DSCS.rsa2048,
    signatureAlgorithm: id_sha256WithRSAEncryption,
  },
  jane: {
    file: "jane-miller-smith-rsa-3072-sha384.json",
    dsc: DSCS.rsa3072,
    signatureAlgorithm: id_sha384WithRSAEncryption,
  },
  jack: {
    file: "jack-miller-smith-rsa-4096-sha512.json",
    dsc: DSCS.rsa4096,
    signatureAlgorithm: id_sha512WithRSAEncryption,
  },
  misterSanctioned: {
    file: "mister-sanctioned-rsa-2048-sha256.json",
    dsc: DSCS.rsa2048,
    signatureAlgorithm: id_sha256WithRSAEncryption,
  },
  mary: {
    file: "mary-miller-smith-ecdsa-p256-sha256.json",
    dsc: DSCS.p256,
    signatureAlgorithm: id_ecdsaWithSHA256,
  },
  paul: {
    file: "paul-miller-smith-ecdsa-p384-sha384.json",
    dsc: DSCS.p384,
    signatureAlgorithm: id_ecdsaWithSHA384,
  },
  stephanie: {
    file: "stephanie-miller-smith-ecdsa-p521-sha512.json",
    dsc: DSCS.p521,
    signatureAlgorithm: id_ecdsaWithSHA512,
  },
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

async function main() {
  mkdirSync(keyPairsDir, { recursive: true })

  const cscas = new Map<CertificateSpec, IssuedCertificate>()
  for (const spec of [RSA_CSCA, ECDSA_CSCA]) {
    cscas.set(spec, await issueCsca(spec))
  }

  const dscs = new Map<DscSpec, IssuedCertificate>()
  for (const spec of Object.values(DSCS)) {
    dscs.set(spec, await issueDsc(spec, cscas.get(spec.csca)!))
  }

  const passports = getMockPassports()
  for (const name of Object.keys(SODS) as MockPassportName[]) {
    const { file, dsc: dscSpec, signatureAlgorithm } = SODS[name]
    const dsc = dscs.get(dscSpec)!
    const dg1 = passports[name].dataGroups.find((group) => group.groupNumber === 1)!.value

    const { sod } = generateSod(
      Binary.from(dg1),
      [dsc.certificate],
      dscSpec.hashAlgorithm,
      new AlgorithmIdentifier({ algorithm: signatureAlgorithm }),
    )
    const { sod: signedSod } = await signSod(sod, dsc.keyPair, dscSpec.hashAlgorithm)

    const encoded = Buffer.from(AsnSerializer.serialize(wrapSodInContentInfo(signedSod)))
    writeFileSync(
      path.join(sodsDir, file),
      `${JSON.stringify({ encoded: encoded.toString("base64") }, null, 2)}\n`,
    )
    console.log(`${file}: signed by ${dscSpec.file}`)
  }
}

/** Issue a self-signed CSCA certificate with the CSCA key pair, which must already exist */
async function issueCsca(spec: CertificateSpec): Promise<IssuedCertificate> {
  const keyPairPath = path.join(keyPairsDir, `${spec.file}.json`)
  if (!existsSync(keyPairPath)) {
    throw new Error(`${keyPairPath} not found: the mock passports must chain to the ZKR CSCA keys`)
  }
  const keyPair = await loadKeypairFromFile(keyPairPath)

  const keyIdentifier = sha256(keyPair.publicKey)
  const certificate = await generateCertificate({
    subject: CSCA_NAME,
    issuer: CSCA_NAME,
    publicKey: keyPair.publicKey,
    signingKeyPair: keyPair,
    isCA: true,
    validityYears: 10,
    serialNumber: new Uint8Array([spec.serialNumber]),
    subjectKeyIdentifier: keyIdentifier,
    authorityKeyIdentifier: keyIdentifier,
    hashAlgorithm: spec.hashAlgorithm,
  })
  writePem(spec.file, certificate)
  return { certificate, keyPair }
}

/** Issue a DSC certificate, reusing its key pair if one was saved and saving a new one otherwise */
async function issueDsc(spec: DscSpec, csca: IssuedCertificate): Promise<IssuedCertificate> {
  const keyPairPath = path.join(keyPairsDir, `${spec.file}.json`)
  const keyPair = existsSync(keyPairPath)
    ? await loadKeypairFromFile(keyPairPath)
    : spec.key.type === "RSA"
      ? await generateRsaKeyPair(spec.key.size, spec.hashAlgorithm)
      : await generateEcdsaKeyPair(spec.key.curve)
  saveKeypairToFile(keyPair, keyPairPath, spec.hashAlgorithm)

  const certificate = await generateCertificate({
    subject: DSC_NAME,
    issuer: CSCA_NAME,
    publicKey: keyPair.publicKey,
    signingKeyPair: csca.keyPair,
    isCA: false,
    validityYears: 10,
    serialNumber: new Uint8Array([spec.serialNumber]),
    subjectKeyIdentifier: sha256(keyPair.publicKey),
    authorityKeyIdentifier: sha256(csca.keyPair.publicKey),
    // The CSCA signs with its own hash algorithm; the DSC's is the one it signs SODs with
    hashAlgorithm: spec.csca.hashAlgorithm,
  })
  writePem(spec.file, certificate)
  return { certificate, keyPair }
}

function writePem(file: string, certificate: Certificate) {
  const pem = PemConverter.encode(AsnSerializer.serialize(certificate), "CERTIFICATE")
  writeFileSync(path.join(certificatesDir, `${file}.pem`), pem)
}
