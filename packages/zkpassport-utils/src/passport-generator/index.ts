import { readFileSync, writeFileSync } from "node:fs"
import { ecdsa, weierstrass } from "@noble/curves/abstract/weierstrass.js"
import type { ECDSA } from "@noble/curves/abstract/weierstrass.js"
import { brainpoolP256r1, brainpoolP384r1, brainpoolP512r1 } from "@noble/curves/misc.js"
import { p256, p384, p521 } from "@noble/curves/nist.js"
import { sha1 } from "@noble/hashes/legacy.js"
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js"
import type { CHash } from "@noble/hashes/utils.js"
import { SignedData, SignerInfo, SignerInfos } from "@peculiar/asn1-cms"
import { id_mgf1, id_RSASSA_PSS, RsaSaPssParams } from "@peculiar/asn1-rsa"
import { AsnConvert, AsnSerializer, OctetString } from "@peculiar/asn1-schema"
import {
  AttributeTypeAndValue,
  AttributeValue,
  AuthorityKeyIdentifier,
  BasicConstraints,
  Certificate,
  Extension as X509Extension,
  Extensions,
  KeyIdentifier,
  KeyUsage,
  KeyUsageFlags,
  Name,
  RelativeDistinguishedName,
  SubjectKeyIdentifier,
  SubjectPublicKeyInfo,
  TBSCertificate,
  Validity,
  Version,
  AlgorithmIdentifier as X509AlgorithmIdentifier,
} from "@peculiar/asn1-x509"
import { Extension, PemConverter, X509CertificateGenerator } from "@peculiar/x509"
import { AttributeSet } from "../cms/asn"

import { getHashAlgorithmIdentifier } from "./sod"

export { generateSod, wrapSodInContentInfo } from "./sod"

export type EcdsaCurve =
  | "P-192"
  | "P-224"
  | "P-256"
  | "P-384"
  | "P-521"
  | "brainpoolP192r1"
  | "brainpoolP224r1"
  | "brainpoolP256r1"
  | "brainpoolP384r1"
  | "brainpoolP512r1"

export type HashAlgorithm = "SHA-1" | "SHA-224" | "SHA-256" | "SHA-384" | "SHA-512"

export type KeyPair = {
  /** SubjectPublicKeyInfo, DER */
  publicKey: Uint8Array
  /** PKCS #8, DER */
  privateKey: Uint8Array
  /**
   * The keys as WebCrypto keys, for RSA. ECDSA keys sign through noble-curves, which also covers the
   * Brainpool curves WebCrypto lacks, so theirs are empty placeholders
   */
  cryptoKey: {
    publicKey: CryptoKey
    privateKey: CryptoKey
  }
} & (
  | { type: "RSA"; modulusLength: number }
  | { type: "ECDSA"; curve: EcdsaCurve; rawSecretKey: Uint8Array }
)

type CertificateParams = {
  subject: { type: string; value: string }[]
  issuer: { type: string; value: string }[]
  publicKey: Uint8Array
  signingKeyPair: KeyPair
  isCA: boolean
  validityYears: number
  serialNumber?: Uint8Array
  subjectKeyIdentifier?: Uint8Array
  authorityKeyIdentifier?: Uint8Array
  hashAlgorithm?: HashAlgorithm
}

/**
 * Generate an RSASSA-PKCS1-v1_5 key pair with public exponent 65537.
 */
export async function generateRsaKeyPair(
  keySize: number,
  hashAlgorithm: HashAlgorithm = "SHA-256",
): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: keySize,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: hashAlgorithm,
    },
    true,
    ["sign", "verify"],
  )

  return {
    publicKey: new Uint8Array(await crypto.subtle.exportKey("spki", keyPair.publicKey)),
    privateKey: new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)),
    type: "RSA",
    modulusLength: keySize,
    cryptoKey: { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey },
  }
}

/**
 * Generate an ECDSA key pair on one of the curves passports use.
 */
export async function generateEcdsaKeyPair(curve: EcdsaCurve): Promise<KeyPair> {
  const nobleCurve = NOBLE_CURVES[curve]
  const { secretKey } = nobleCurve.keygen()
  const uncompressedPublicKey = nobleCurve.getPublicKey(secretKey, false)

  const unusedCryptoKey = {} as CryptoKey
  return {
    publicKey: encodeSpki(curve, uncompressedPublicKey),
    privateKey: encodePkcs8(curve, secretKey, uncompressedPublicKey),
    type: "ECDSA",
    curve,
    rawSecretKey: secretKey,
    cryptoKey: { publicKey: unusedCryptoKey, privateKey: unusedCryptoKey },
  }
}

/**
 * Generate a test CSCA ("ZKpassport Test Root CSC") and a DSC it signs, with new keys unless a DSC
 * key pair is given.
 */
export async function generateSigningCertificates({
  cscSigningHashAlgorithm = "SHA-256",
  cscKeyType = "ECDSA",
  cscCurve = "P-521",
  dscSigningHashAlgorithm = "SHA-256",
  dscKeyType = "ECDSA",
  dscCurve = "P-256",
  cscKeySize = 4096,
  dscKeySize = 2048,
  dscKeypair,
  issuingCountry = "AU",
}: {
  cscSigningHashAlgorithm?: HashAlgorithm
  cscKeyType?: "RSA" | "ECDSA"
  dscSigningHashAlgorithm?: HashAlgorithm
  dscKeyType?: "RSA" | "ECDSA"
  cscCurve?: EcdsaCurve
  dscCurve?: EcdsaCurve
  cscKeySize?: number
  dscKeySize?: number
  dscKeypair?: KeyPair
  issuingCountry?: string
} = {}) {
  const cscKeys =
    cscKeyType === "RSA"
      ? await generateRsaKeyPair(cscKeySize, cscSigningHashAlgorithm)
      : await generateEcdsaKeyPair(cscCurve)
  const dscKeys =
    dscKeypair ??
    (dscKeyType === "RSA"
      ? await generateRsaKeyPair(dscKeySize, dscSigningHashAlgorithm)
      : await generateEcdsaKeyPair(dscCurve))

  const cscSubjectKeyIdentifier = sha256(cscKeys.publicKey)
  const dscSubjectKeyIdentifier = sha256(dscKeys.publicKey)
  const cscName = [
    { type: "2.5.4.3", value: "ZKpassport Test Root CSC" },
    { type: "2.5.4.6", value: issuingCountry },
  ]

  const cscCert = await generateCertificate({
    subject: cscName,
    issuer: cscName,
    publicKey: cscKeys.publicKey,
    signingKeyPair: cscKeys,
    isCA: true,
    validityYears: 10,
    serialNumber: new Uint8Array([0x01]),
    subjectKeyIdentifier: cscSubjectKeyIdentifier,
    hashAlgorithm: cscSigningHashAlgorithm,
  })
  const dscCert = await generateCertificate({
    subject: [{ type: "2.5.4.3", value: "ZKPassport Test DSC" }],
    issuer: cscName,
    publicKey: dscKeys.publicKey,
    signingKeyPair: cscKeys,
    isCA: false,
    validityYears: 2,
    serialNumber: new Uint8Array([0x02]),
    subjectKeyIdentifier: dscSubjectKeyIdentifier,
    authorityKeyIdentifier: cscSubjectKeyIdentifier,
    hashAlgorithm: cscSigningHashAlgorithm,
  })

  return {
    csc: cscCert,
    cscPem: PemConverter.encode(AsnSerializer.serialize(cscCert), "CERTIFICATE"),
    cscKeys,
    dsc: dscCert,
    dscPem: PemConverter.encode(AsnSerializer.serialize(dscCert), "CERTIFICATE"),
    dscKeys,
  }
}

/**
 * Generate an X.509 certificate signed by `signingKeyPair`, valid from now.
 */
export async function generateCertificate(params: CertificateParams): Promise<Certificate> {
  if (params.signingKeyPair.type === "RSA") {
    return generateCertificateWithWebCrypto(params)
  }

  const hashAlgorithm = params.hashAlgorithm ?? "SHA-256"
  const signatureAlgorithm = new X509AlgorithmIdentifier({
    algorithm: ECDSA_SIGNATURE_OIDS[hashAlgorithm],
  })
  const tbsCertificate = new TBSCertificate({
    version: Version.v3,
    serialNumber: new Uint8Array(params.serialNumber ?? [0x01]).buffer,
    signature: signatureAlgorithm,
    issuer: buildName(params.issuer),
    validity: new Validity({ notBefore: new Date(), notAfter: validUntil(params.validityYears) }),
    subject: buildName(params.subject),
    subjectPublicKeyInfo: AsnConvert.parse(params.publicKey, SubjectPublicKeyInfo),
    extensions: new Extensions(
      certificateExtensions(params).map(
        ({ id, critical, value }) =>
          new X509Extension({ extnID: id, critical, extnValue: new OctetString(value) }),
      ),
    ),
  })

  const signature = ecdsaSign(
    NOBLE_CURVES[params.signingKeyPair.curve],
    params.signingKeyPair.rawSecretKey,
    new Uint8Array(AsnSerializer.serialize(tbsCertificate)),
    hashAlgorithm,
    "der",
  )
  return new Certificate({
    tbsCertificate,
    signatureAlgorithm: signatureAlgorithm,
    signatureValue: new Uint8Array(signature).buffer,
  })
}

/**
 * The RSASSA-PSS signature algorithm for generateSod: the hash, MGF1 over the same hash, and a salt
 * as long as the hash. signSod then signs with RSA-PSS.
 */
export function getRsaPssSignatureAlgorithm(hashAlgorithm: HashAlgorithm) {
  const hash = new X509AlgorithmIdentifier({ algorithm: getHashAlgorithmIdentifier(hashAlgorithm) })
  const parameters = new RsaSaPssParams({
    hashAlgorithm: hash,
    maskGenAlgorithm: new X509AlgorithmIdentifier({
      algorithm: id_mgf1,
      parameters: AsnSerializer.serialize(hash),
    }),
    saltLength: HASH_FUNCTIONS[hashAlgorithm].outputLen,
  })
  return new X509AlgorithmIdentifier({
    algorithm: id_RSASSA_PSS,
    parameters: AsnSerializer.serialize(parameters),
  })
}

/**
 * Sign a SOD's signed attributes with the DSC key pair. An RSA key signs with RSA-PSS when the SOD's
 * signature algorithm is RSASSA-PSS, and with RSASSA-PKCS1-v1_5 otherwise.
 */
export async function signSod(sod: SignedData, signerKeys: KeyPair, hashAlgorithm: HashAlgorithm) {
  const signerInfo = sod.signerInfos[0]
  const signedAttrs = new AttributeSet(signerInfo?.signedAttrs?.map((attribute) => attribute))
  const signedAttrsBytes = new Uint8Array(AsnConvert.serialize(signedAttrs))

  // ECDSA signatures in IEEE P1363 form (r ‖ s), as WebCrypto would return them
  const signature =
    signerKeys.type === "RSA"
      ? await rsaSign(signerKeys, signedAttrsBytes, hashAlgorithm, signerInfo.signatureAlgorithm)
      : ecdsaSign(
          NOBLE_CURVES[signerKeys.curve],
          signerKeys.rawSecretKey,
          signedAttrsBytes,
          hashAlgorithm,
          "compact",
        )

  const signedSod = new SignedData({
    version: sod.version,
    digestAlgorithms: sod.digestAlgorithms,
    encapContentInfo: sod.encapContentInfo,
    certificates: sod.certificates,
    signerInfos: new SignerInfos([
      new SignerInfo({
        version: signerInfo.version,
        sid: signerInfo.sid,
        digestAlgorithm: signerInfo.digestAlgorithm,
        signedAttrs: signerInfo.signedAttrs,
        signatureAlgorithm: signerInfo.signatureAlgorithm,
        signature: new OctetString(signature),
      }),
    ]),
  })
  return { signature, sod: signedSod }
}

/**
 * Write a key pair as JSON, keys in base64, for loadKeypairFromFile.
 */
export function saveKeypairToFile(
  keypair: KeyPair,
  filePath: string,
  hashAlgorithm: HashAlgorithm = "SHA-256",
) {
  const keypairData = {
    publicKey: Buffer.from(keypair.publicKey).toString("base64"),
    privateKey: Buffer.from(keypair.privateKey).toString("base64"),
    hashAlgorithm,
    type: keypair.type,
    ...(keypair.type === "RSA"
      ? { modulusLength: keypair.modulusLength }
      : { curve: keypair.curve }),
  }
  writeFileSync(filePath, JSON.stringify(keypairData, null, 2))
}

/**
 * Read a key pair written by saveKeypairToFile.
 */
export async function loadKeypairFromFile(filePath: string): Promise<KeyPair> {
  const keypairData = JSON.parse(readFileSync(filePath, "utf-8"))
  const publicKey = new Uint8Array(Buffer.from(keypairData.publicKey, "base64"))
  const privateKey = new Uint8Array(Buffer.from(keypairData.privateKey, "base64"))

  if (keypairData.type === "RSA") {
    const algorithm = {
      name: "RSASSA-PKCS1-v1_5",
      hash: keypairData.hashAlgorithm ?? "SHA-256",
    }
    return {
      publicKey,
      privateKey,
      type: "RSA",
      modulusLength: keypairData.modulusLength,
      cryptoKey: {
        publicKey: await crypto.subtle.importKey("spki", publicKey, algorithm, true, ["verify"]),
        privateKey: await crypto.subtle.importKey("pkcs8", privateKey, algorithm, true, ["sign"]),
      },
    }
  }

  const unusedCryptoKey = {} as CryptoKey
  return {
    publicKey,
    privateKey,
    type: "ECDSA",
    curve: keypairData.curve,
    rawSecretKey: extractRawSecretKeyFromPkcs8(privateKey),
    cryptoKey: { publicKey: unusedCryptoKey, privateKey: unusedCryptoKey },
  }
}

async function generateCertificateWithWebCrypto(params: CertificateParams): Promise<Certificate> {
  const x509Certificate = await X509CertificateGenerator.create(
    {
      serialNumber: params.serialNumber ? Buffer.from(params.serialNumber).toString("hex") : "1",
      notBefore: new Date(),
      notAfter: validUntil(params.validityYears),
      extensions: certificateExtensions(params).map(
        ({ id, critical, value }) => new Extension(id, critical, value),
      ),
      subject: params.subject.map((attribute) => `${attribute.type}=${attribute.value}`).join(","),
      issuer: params.issuer.map((attribute) => `${attribute.type}=${attribute.value}`).join(","),
      publicKey: new Uint8Array(params.publicKey),
      signingKey: params.signingKeyPair.cryptoKey.privateKey,
    },
    crypto,
  )

  const rawCertificate = PemConverter.decode(await x509Certificate.toString("pem"))[0]
  return AsnConvert.parse(rawCertificate, Certificate)
}

/** Basic constraints, key usage and the key identifiers, DER-encoded */
function certificateExtensions(params: CertificateParams) {
  const keyUsage = params.isCA
    ? KeyUsageFlags.keyCertSign | KeyUsageFlags.digitalSignature
    : KeyUsageFlags.digitalSignature
  const extensions = [
    {
      id: "2.5.29.19",
      critical: true,
      value: AsnSerializer.serialize(new BasicConstraints({ cA: params.isCA })),
    },
    { id: "2.5.29.15", critical: true, value: AsnSerializer.serialize(new KeyUsage(keyUsage)) },
  ]
  if (params.subjectKeyIdentifier) {
    extensions.push({
      id: "2.5.29.14",
      critical: false,
      value: AsnSerializer.serialize(new SubjectKeyIdentifier(params.subjectKeyIdentifier)),
    })
  }
  if (params.authorityKeyIdentifier) {
    extensions.push({
      id: "2.5.29.35",
      critical: false,
      value: AsnSerializer.serialize(
        new AuthorityKeyIdentifier({
          keyIdentifier: new KeyIdentifier(params.authorityKeyIdentifier),
        }),
      ),
    })
  }
  return extensions
}

function validUntil(validityYears: number) {
  return new Date(Date.now() + validityYears * 365 * 24 * 60 * 60 * 1000)
}

function buildName(attributes: { type: string; value: string }[]): Name {
  return new Name(
    attributes.map(
      ({ type, value }) =>
        new RelativeDistinguishedName([
          new AttributeTypeAndValue({
            type,
            // Country names (2.5.4.6) are PrintableStrings
            value: new AttributeValue(
              type === "2.5.4.6" ? { printableString: value } : { utf8String: value },
            ),
          }),
        ]),
    ),
  )
}

async function rsaSign(
  keyPair: KeyPair,
  message: Uint8Array<ArrayBuffer>,
  hashAlgorithm: HashAlgorithm,
  signatureAlgorithm: X509AlgorithmIdentifier,
): Promise<Uint8Array> {
  if (signatureAlgorithm.algorithm !== id_RSASSA_PSS) {
    const pkcs1 = { name: "RSASSA-PKCS1-v1_5", hash: hashAlgorithm }
    return new Uint8Array(await crypto.subtle.sign(pkcs1, keyPair.cryptoKey.privateKey, message))
  }

  // The key pair's WebCrypto key is for RSASSA-PKCS1-v1_5, so import the key again for RSA-PSS
  const { saltLength } = AsnConvert.parse(signatureAlgorithm.parameters!, RsaSaPssParams)
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    new Uint8Array(keyPair.privateKey),
    { name: "RSA-PSS", hash: hashAlgorithm },
    false,
    ["sign"],
  )
  return new Uint8Array(
    await crypto.subtle.sign({ name: "RSA-PSS", saltLength }, privateKey, message),
  )
}

function ecdsaSign(
  curve: ECDSA,
  rawSecretKey: Uint8Array,
  message: Uint8Array<ArrayBuffer>,
  hashAlgorithm: HashAlgorithm,
  format: "compact" | "der",
): Uint8Array {
  const messageHash = HASH_FUNCTIONS[hashAlgorithm](message)
  return curve.sign(messageHash, rawSecretKey, { prehash: false, lowS: false, format })
}

function encodeSpki(curve: EcdsaCurve, publicKey: Uint8Array): Uint8Array {
  const algorithm = derSequence(derOid(EC_PUBLIC_KEY_OID), derOid(CURVE_OIDS[curve]))
  return derSequence(algorithm, derBitString(publicKey))
}

function encodePkcs8(curve: EcdsaCurve, rawSecretKey: Uint8Array, publicKey: Uint8Array) {
  const algorithm = derSequence(derOid(EC_PUBLIC_KEY_OID), derOid(CURVE_OIDS[curve]))
  const ecPrivateKey = derSequence(
    derInteger(new Uint8Array([1])),
    derOctetString(rawSecretKey),
    derContextTag(1, derBitString(publicKey)),
  )
  return derSequence(derInteger(new Uint8Array([0])), algorithm, derOctetString(ecPrivateKey))
}

/** The raw key in PKCS #8 { version, algorithm, OCTET STRING ECPrivateKey { version, key } } */
function extractRawSecretKeyFromPkcs8(pkcs8: Uint8Array): Uint8Array {
  let offset = skipTagAndLength(pkcs8, 0)
  offset = skipTlv(pkcs8, offset)
  offset = skipTlv(pkcs8, offset)
  const ecPrivateKey = readTlvValue(pkcs8, offset)

  const keyOffset = skipTlv(ecPrivateKey, skipTagAndLength(ecPrivateKey, 0))
  return readTlvValue(ecPrivateKey, keyOffset)
}

function derLength(length: number): Uint8Array {
  if (length < 128) {
    return new Uint8Array([length])
  }
  if (length < 256) {
    return new Uint8Array([0x81, length])
  }
  return new Uint8Array([0x82, (length >> 8) & 0xff, length & 0xff])
}

function derWrap(tag: number, content: Uint8Array): Uint8Array {
  const length = derLength(content.length)
  const result = new Uint8Array(1 + length.length + content.length)
  result[0] = tag
  result.set(length, 1)
  result.set(content, 1 + length.length)
  return result
}

function derSequence(...items: Uint8Array[]): Uint8Array {
  const content = new Uint8Array(items.reduce((sum, item) => sum + item.length, 0))
  let offset = 0
  for (const item of items) {
    content.set(item, offset)
    offset += item.length
  }
  return derWrap(0x30, content)
}

function derInteger(value: Uint8Array): Uint8Array {
  // A leading zero keeps a value with its high bit set positive
  if (value.length > 0 && value[0] & 0x80) {
    const padded = new Uint8Array(value.length + 1)
    padded.set(value, 1)
    return derWrap(0x02, padded)
  }
  return derWrap(0x02, value)
}

function derOctetString(data: Uint8Array): Uint8Array {
  return derWrap(0x04, data)
}

function derBitString(data: Uint8Array): Uint8Array {
  // The first content byte counts the unused bits, here none
  const content = new Uint8Array(1 + data.length)
  content.set(data, 1)
  return derWrap(0x03, content)
}

function derOid(oid: string): Uint8Array {
  const arcs = oid.split(".").map(Number)
  const bytes = [40 * arcs[0] + arcs[1]]
  for (let arc of arcs.slice(2)) {
    const encoded = [arc & 0x7f]
    arc >>= 7
    while (arc > 0) {
      encoded.unshift((arc & 0x7f) | 0x80)
      arc >>= 7
    }
    bytes.push(...encoded)
  }
  return derWrap(0x06, new Uint8Array(bytes))
}

function derContextTag(tag: number, data: Uint8Array): Uint8Array {
  return derWrap(0xa0 | tag, data)
}

function skipTagAndLength(data: Uint8Array, offset: number): number {
  const lengthByte = data[offset + 1]
  return lengthByte < 128 ? offset + 2 : offset + 2 + (lengthByte & 0x7f)
}

function getTlvLength(data: Uint8Array, offset: number): number {
  const lengthByte = data[offset + 1]
  if (lengthByte < 128) {
    return lengthByte
  }
  if (lengthByte === 0x81) {
    return data[offset + 2]
  }
  return (data[offset + 2] << 8) | data[offset + 3]
}

function skipTlv(data: Uint8Array, offset: number): number {
  return skipTagAndLength(data, offset) + getTlvLength(data, offset)
}

function readTlvValue(data: Uint8Array, offset: number): Uint8Array {
  const valueStart = skipTagAndLength(data, offset)
  return data.slice(valueStart, valueStart + getTlvLength(data, offset))
}

// The curves noble-curves does not ship
const p192 = ecdsa(
  weierstrass({
    p: BigInt("0xfffffffffffffffffffffffffffffffeffffffffffffffff"),
    n: BigInt("0xffffffffffffffffffffffff99def836146bc9b1b4d22831"),
    h: BigInt(1),
    a: BigInt("0xfffffffffffffffffffffffffffffffefffffffffffffffc"),
    b: BigInt("0x64210519e59c80e70fa7e9ab72243049feb8deecc146b9b1"),
    Gx: BigInt("0x188da80eb03090f67cbf20eb43a18800f4ff0afd82ff1012"),
    Gy: BigInt("0x07192b95ffc8da78631011ed6b24cdd573f977a11e794811"),
  }),
  sha1,
)

const p224 = ecdsa(
  weierstrass({
    p: BigInt("0xffffffffffffffffffffffffffffffff000000000000000000000001"),
    n: BigInt("0xffffffffffffffffffffffffffff16a2e0b8f03e13dd29455c5c2a3d"),
    h: BigInt(1),
    a: BigInt("0xfffffffffffffffffffffffffffffffefffffffffffffffffffffffe"),
    b: BigInt("0xb4050a850c04b3abf54132565044b0b7d7bfd8ba270b39432355ffb4"),
    Gx: BigInt("0xb70e0cbd6bb4bf7f321390b94a03c1d356c21122343280d6115c1d21"),
    Gy: BigInt("0xbd376388b5f723fb4c22dfe6cd4375a05a07476444d5819985007e34"),
  }),
  sha224,
)

const brainpoolP192r1 = ecdsa(
  weierstrass({
    p: BigInt("0xc302f41d932a36cda7a3463093d18db78fce476de1a86297"),
    n: BigInt("0xc302f41d932a36cda7a3462f9e9e916b5be8f1029ac4acc1"),
    h: BigInt(1),
    a: BigInt("0x6a91174076b1e0e19c39c031fe8685c1cae040e5c69a28ef"),
    b: BigInt("0x469a28ef7c28cca3dc721d044f4496bcca7ef4146fbf25c9"),
    Gx: BigInt("0xc0a0647eaab6a48753b033c56cb0f0900a2f5c4853375fd6"),
    Gy: BigInt("0x14b690866abd5bb88b5f4828c1490002e6773fa2fa299b8f"),
  }),
  sha1,
)

const brainpoolP224r1 = ecdsa(
  weierstrass({
    p: BigInt("0xd7c134aa264366862a18302575d1d787b09f075797da89f57ec8c0ff"),
    n: BigInt("0xd7c134aa264366862a18302575d0fb98d116bc4b6ddebca3a5a7939f"),
    h: BigInt(1),
    a: BigInt("0x68a5e62ca9ce6c1c299803a6c1530b514e182ad8b0042a59cad29f43"),
    b: BigInt("0x2580f63ccfe44138870713b1a92369e33e2135d266dbb372386c400b"),
    Gx: BigInt("0x0d9029ad2c7e5cf4340823b2a87dc68c9e4ce3174c1e6efdee12c07d"),
    Gy: BigInt("0x58aa56f772c0726f24c6b89e4ecdac24354b9e99caa3f6d3761402cd"),
  }),
  sha224,
)

const NOBLE_CURVES: Record<EcdsaCurve, ECDSA> = {
  "P-192": p192,
  "P-224": p224,
  "P-256": p256,
  "P-384": p384,
  "P-521": p521,
  brainpoolP192r1,
  brainpoolP224r1,
  brainpoolP256r1,
  brainpoolP384r1,
  brainpoolP512r1,
}

const HASH_FUNCTIONS: Record<HashAlgorithm, CHash> = {
  "SHA-1": sha1,
  "SHA-224": sha224,
  "SHA-256": sha256,
  "SHA-384": sha384,
  "SHA-512": sha512,
}

const CURVE_OIDS: Record<EcdsaCurve, string> = {
  "P-192": "1.2.840.10045.3.1.1",
  "P-224": "1.3.132.0.33",
  "P-256": "1.2.840.10045.3.1.7",
  "P-384": "1.3.132.0.34",
  "P-521": "1.3.132.0.35",
  "brainpoolP192r1": "1.3.36.3.3.2.8.1.1.3",
  "brainpoolP224r1": "1.3.36.3.3.2.8.1.1.5",
  "brainpoolP256r1": "1.3.36.3.3.2.8.1.1.7",
  "brainpoolP384r1": "1.3.36.3.3.2.8.1.1.11",
  "brainpoolP512r1": "1.3.36.3.3.2.8.1.1.13",
}

const ECDSA_SIGNATURE_OIDS: Record<HashAlgorithm, string> = {
  "SHA-1": "1.2.840.10045.4.1",
  "SHA-224": "1.2.840.10045.4.3.1",
  "SHA-256": "1.2.840.10045.4.3.2",
  "SHA-384": "1.2.840.10045.4.3.3",
  "SHA-512": "1.2.840.10045.4.3.4",
}

const EC_PUBLIC_KEY_OID = "1.2.840.10045.2.1"
