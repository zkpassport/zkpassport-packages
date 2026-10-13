import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { sha256 } from "@noble/hashes/sha2.js"
import { ContentInfo, SignedData } from "@peculiar/asn1-cms"
import { id_ecdsaWithSHA256, id_ecdsaWithSHA384, id_ecdsaWithSHA512 } from "@peculiar/asn1-ecc"
import {
  id_sha256WithRSAEncryption,
  id_sha384WithRSAEncryption,
  id_sha512WithRSAEncryption,
} from "@peculiar/asn1-rsa"
import { AsnConvert, AsnSerializer } from "@peculiar/asn1-schema"
import { AlgorithmIdentifier, Certificate } from "@peculiar/asn1-x509"
import { PemConverter } from "@peculiar/x509"
import { getDG1, HOLDERS, type MockPassportName } from "../src/mock-passports/holders"
import {
  type EcdsaCurve,
  generateCertificate,
  generateEcdsaKeyPair,
  generateRsaKeyPair,
  generateSod,
  getRsaPssSignatureAlgorithm,
  type HashAlgorithm,
  type KeyPair,
  loadKeypairFromFile,
  saveKeypairToFile,
  signSod,
  wrapSodInContentInfo,
} from "../src/passport-generator"

type CscaSpec = { file: string; hashAlgorithm: HashAlgorithm }

type DscSpec = {
  csca: CscaSpec
  file: string
  key: { type: "RSA"; size: number } | { type: "ECDSA"; curve: EcdsaCurve }
  hashAlgorithm: HashAlgorithm
  serialNumber: number
}

type SodSpec = { file: string; dsc: DscSpec; signatureAlgorithm: AlgorithmIdentifier }

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

// The two ZKR CSCAs in the testnet certificate registry
const RSA_CSCA: CscaSpec = { file: "zkr-csca-rsa-2048-sha256", hashAlgorithm: "SHA-256" }
const ECDSA_CSCA: CscaSpec = { file: "zkr-csca-ecdsa-p256-sha256", hashAlgorithm: "SHA-256" }

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
  rsa4096Pss: {
    csca: RSA_CSCA,
    file: "zkr-dsc-rsa-4096-pss-sha512",
    key: { type: "RSA", size: 4096 },
    hashAlgorithm: "SHA-512",
    serialNumber: 0x09,
  },
} satisfies Record<string, DscSpec>

const SODS: Record<MockPassportName, SodSpec> = {
  john: {
    file: "john-miller-smith-rsa-2048-sha256.json",
    dsc: DSCS.rsa2048,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_sha256WithRSAEncryption }),
  },
  jane: {
    file: "jane-miller-smith-rsa-3072-sha384.json",
    dsc: DSCS.rsa3072,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_sha384WithRSAEncryption }),
  },
  jack: {
    file: "jack-miller-smith-rsa-4096-sha512.json",
    dsc: DSCS.rsa4096,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_sha512WithRSAEncryption }),
  },
  misterSanctioned: {
    file: "mister-sanctioned-rsa-2048-sha256.json",
    dsc: DSCS.rsa2048,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_sha256WithRSAEncryption }),
  },
  mary: {
    file: "mary-miller-smith-ecdsa-p256-sha256.json",
    dsc: DSCS.p256,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_ecdsaWithSHA256 }),
  },
  paul: {
    file: "paul-miller-smith-ecdsa-p384-sha384.json",
    dsc: DSCS.p384,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_ecdsaWithSHA384 }),
  },
  stephanie: {
    file: "stephanie-miller-smith-ecdsa-p521-sha512.json",
    dsc: DSCS.p521,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_ecdsaWithSHA512 }),
  },
  peter: {
    file: "peter-miller-smith-rsa-2048-sha256.json",
    dsc: DSCS.rsa2048,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_sha256WithRSAEncryption }),
  },
  lucie: {
    file: "lucie-miller-smith-rsa-2048-sha256.json",
    dsc: DSCS.rsa2048,
    signatureAlgorithm: new AlgorithmIdentifier({ algorithm: id_sha256WithRSAEncryption }),
  },
  mark: {
    file: "mark-miller-smith-rsa-4096-pss-sha512.json",
    dsc: DSCS.rsa4096Pss,
    signatureAlgorithm: getRsaPssSignatureAlgorithm("SHA-512"),
  },
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

/**
 * Sign every mock passport's SOD, issuing a DSC under its ZKR CSCA when the DSC's key pair or
 * certificate is missing from scripts/zkr. Returns each SOD file's name and contents.
 */
export async function signMockPassports(): Promise<{ file: string; contents: string }[]> {
  const cscaKeyPairs = new Map<CscaSpec, KeyPair>()
  for (const spec of [RSA_CSCA, ECDSA_CSCA]) {
    cscaKeyPairs.set(spec, await loadKeypairFromFile(path.join(keyPairsDir, `${spec.file}.json`)))
  }

  const dscs = new Map<DscSpec, IssuedCertificate>()
  for (const spec of Object.values(DSCS)) {
    dscs.set(spec, await loadOrIssueDsc(spec, cscaKeyPairs.get(spec.csca)!))
  }

  const sods = []
  for (const name of Object.keys(SODS) as MockPassportName[]) {
    const spec = SODS[name]
    const encoded = await signHolderSod(name, spec, dscs.get(spec.dsc)!)
    const contents = `${JSON.stringify({ encoded: encoded.toString("base64") }, null, 2)}\n`
    sods.push({ file: spec.file, contents })
  }
  return sods
}

async function main() {
  for (const { file, contents } of await signMockPassports()) {
    writeFileSync(path.join(sodsDir, file), contents)
    console.log(`${file}: written`)
  }
}

/** Load a DSC's key pair and certificate, issuing the certificate (and the key pair) if missing */
async function loadOrIssueDsc(spec: DscSpec, cscaKeyPair: KeyPair): Promise<IssuedCertificate> {
  const keyPairPath = path.join(keyPairsDir, `${spec.file}.json`)
  const certificatePath = path.join(certificatesDir, `${spec.file}.pem`)

  const keyPair = existsSync(keyPairPath)
    ? await loadKeypairFromFile(keyPairPath)
    : await generateDscKeyPair(spec, keyPairPath)

  if (existsSync(certificatePath)) {
    const [der] = PemConverter.decode(readFileSync(certificatePath, "utf-8"))
    return { certificate: AsnConvert.parse(der, Certificate), keyPair }
  }

  const certificate = await generateCertificate({
    subject: DSC_NAME,
    issuer: CSCA_NAME,
    publicKey: keyPair.publicKey,
    signingKeyPair: cscaKeyPair,
    isCA: false,
    validityYears: 10,
    serialNumber: new Uint8Array([spec.serialNumber]),
    subjectKeyIdentifier: sha256(keyPair.publicKey),
    authorityKeyIdentifier: sha256(cscaKeyPair.publicKey),
    // The CSCA signs with its own hash algorithm; the DSC's is the one it signs SODs with
    hashAlgorithm: spec.csca.hashAlgorithm,
  })
  writeFileSync(
    certificatePath,
    PemConverter.encode(AsnSerializer.serialize(certificate), "CERTIFICATE"),
  )
  return { certificate, keyPair }
}

async function generateDscKeyPair(spec: DscSpec, keyPairPath: string) {
  const keyPair =
    spec.key.type === "RSA"
      ? await generateRsaKeyPair(spec.key.size, spec.hashAlgorithm)
      : await generateEcdsaKeyPair(spec.key.curve)
  saveKeypairToFile(keyPair, keyPairPath, spec.hashAlgorithm)
  return keyPair
}

/**
 * Sign a holder's SOD. A committed SOD that differs from the new one only in its signature is kept
 * as it is: re-signing changes the signature of an RSA-PSS SOD, whose salt is random, and of the
 * ECDSA SODs, which were signed with random nonces.
 */
async function signHolderSod(name: MockPassportName, spec: SodSpec, dsc: IssuedCertificate) {
  const { sod } = generateSod(
    getDG1(HOLDERS[name]),
    [dsc.certificate],
    spec.dsc.hashAlgorithm,
    spec.signatureAlgorithm,
  )

  const committedPath = path.join(sodsDir, spec.file)
  if (existsSync(committedPath)) {
    const committed = Buffer.from(
      JSON.parse(readFileSync(committedPath, "utf-8")).encoded,
      "base64",
    )
    const committedSod = AsnConvert.parse(
      AsnConvert.parse(committed, ContentInfo).content,
      SignedData,
    )
    sod.signerInfos[0].signature = committedSod.signerInfos[0].signature
    if (encodeSod(sod).equals(committed)) {
      return committed
    }
  }

  const { sod: signedSod } = await signSod(sod, dsc.keyPair, spec.dsc.hashAlgorithm)
  return encodeSod(signedSod)
}

function encodeSod(sod: SignedData) {
  return Buffer.from(AsnSerializer.serialize(wrapSodInContentInfo(sod)))
}
