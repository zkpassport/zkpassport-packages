import { sha1 } from "@noble/hashes/legacy.js"
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js"
import type { CHash } from "@noble/hashes/utils.js"
import {
  Attribute,
  CertificateChoices,
  CertificateSet,
  ContentInfo,
  DigestAlgorithmIdentifier,
  DigestAlgorithmIdentifiers,
  EncapsulatedContent,
  EncapsulatedContentInfo,
  id_signedData,
  SignedData,
  SignerIdentifier,
  SignerInfo,
  SignerInfos,
  SigningTime,
} from "@peculiar/asn1-cms"
import {
  AsnConvert,
  AsnOctetStringConverter,
  AsnSerializer,
  OctetString,
} from "@peculiar/asn1-schema"
import {
  id_mgf1,
  id_RSASSA_PSS,
  id_sha1,
  id_sha224,
  id_sha256,
  id_sha384,
  id_sha512,
  RsaSaPssParams,
} from "@peculiar/asn1-rsa"
import { AlgorithmIdentifier, Certificate, SubjectKeyIdentifier } from "@peculiar/asn1-x509"
import type { Binary } from "../binary"
import {
  AttributeSet,
  DataGroupHash,
  DataGroupNumber,
  id_ldsSecurityObject,
  LDSSecurityObject,
  LDSSecurityObjectIdentifier,
  LDSSecurityObjectVersion,
} from "../cms/asn"
import type { HashAlgorithm } from "."

/**
 * Build an unsigned SOD for DG1, with a placeholder DG2 hash, ready for signSod.
 */
export function generateSod(
  dg1: Binary,
  certificates: Certificate[] = [],
  hashAlgorithm: HashAlgorithm = "SHA-256",
  signatureAlgorithm: AlgorithmIdentifier = new AlgorithmIdentifier({
    algorithm: "1.2.840.113549.1.1.11", // sha256WithRSAEncryption
  }),
) {
  const digestAlgorithms = new DigestAlgorithmIdentifiers([
    new DigestAlgorithmIdentifier({ algorithm: getHashAlgorithmIdentifier(hashAlgorithm) }),
  ])
  const hash = HASH_FUNCTIONS[hashAlgorithm]

  const dg1Hash = hash(dg1.toUInt8Array())
  const encapContentInfo = generateEncapContentInfo(dg1Hash, hashAlgorithm)
  const eContentHash = hash(new Uint8Array(encapContentInfo.eContent!.single!.buffer))

  const signerInfo = new SignerInfo({
    version: 1,
    sid: new SignerIdentifier({
      subjectKeyIdentifier: new SubjectKeyIdentifier(new Uint8Array(32)),
    }),
    digestAlgorithm: new DigestAlgorithmIdentifier({
      algorithm: getHashAlgorithmIdentifier(hashAlgorithm),
    }),
    signedAttrs: generateSignedAttrs(eContentHash),
    signatureAlgorithm,
    signature: new OctetString(new Uint8Array(256)),
  })

  const sod = new SignedData({
    version: 3,
    digestAlgorithms,
    encapContentInfo,
    signerInfos: new SignerInfos([signerInfo]),
    certificates: new CertificateSet(
      certificates.map((certificate) => new CertificateChoices({ certificate })),
    ),
  })
  return { contentInfo: wrapSodInContentInfo(sod), sod }
}

/**
 * RSASSA-PSS signature algorithm for generateSod.
 */
export function getRsaPssSignatureAlgorithm(hashAlgorithm: HashAlgorithm) {
  const hash = new AlgorithmIdentifier({ algorithm: getHashAlgorithmIdentifier(hashAlgorithm) })
  const parameters = new RsaSaPssParams({
    hashAlgorithm: hash,
    maskGenAlgorithm: new AlgorithmIdentifier({
      algorithm: id_mgf1,
      parameters: AsnSerializer.serialize(hash),
    }),
    saltLength: HASH_FUNCTIONS[hashAlgorithm].outputLen,
  })
  return new AlgorithmIdentifier({
    algorithm: id_RSASSA_PSS,
    parameters: AsnSerializer.serialize(parameters),
  })
}

/**
 * Wrap a SOD in the CMS ContentInfo it is stored in on the chip.
 */
export function wrapSodInContentInfo(sod: SignedData) {
  return new ContentInfo({ contentType: id_signedData, content: AsnSerializer.serialize(sod) })
}

function generateEncapContentInfo(dg1Hash: Uint8Array, hashAlgorithm: HashAlgorithm) {
  const ldsSecurityObject = new LDSSecurityObject()
  ldsSecurityObject.version = LDSSecurityObjectVersion.v0
  ldsSecurityObject.hashAlgorithm = new DigestAlgorithmIdentifier({
    algorithm: getHashAlgorithmIdentifier(hashAlgorithm),
  })
  ldsSecurityObject.dataGroups = [
    new DataGroupHash({
      number: DataGroupNumber.dataGroup1,
      hash: new Uint8Array(dg1Hash).buffer,
    }),
    new DataGroupHash({
      number: DataGroupNumber.dataGroup2,
      // A placeholder DG2 hash, cut to the length of the DG1 hash
      hash: new Uint8Array(64).map((_, index) => (index % 8) + 1).slice(0, dg1Hash.length).buffer,
    }),
  ]

  return new EncapsulatedContentInfo({
    eContentType: id_ldsSecurityObject,
    eContent: new EncapsulatedContent({
      single: new OctetString(AsnSerializer.serialize(ldsSecurityObject)),
    }),
  })
}

function generateSignedAttrs(eContentHash: Uint8Array) {
  const contentType = new Attribute({
    attrType: "1.2.840.113549.1.9.3", // id_contentType
    attrValues: [AsnSerializer.serialize(new LDSSecurityObjectIdentifier(id_ldsSecurityObject))],
  })
  const signingTime = new Attribute({
    attrType: "1.2.840.113549.1.9.5", // id_signingTime
    // Fixed, so the same inputs give the same SOD whatever the time zone
    attrValues: [AsnConvert.serialize(new SigningTime(new Date("2024-05-01T00:00:00Z")))],
  })
  const messageDigest = new Attribute({
    attrType: "1.2.840.113549.1.9.4", // id_messageDigest
    attrValues: [
      AsnConvert.serialize(AsnOctetStringConverter.toASN(new Uint8Array(eContentHash).buffer)),
    ],
  })
  return new AttributeSet([contentType, signingTime, messageDigest])
}

function getHashAlgorithmIdentifier(hashAlgorithm: HashAlgorithm) {
  switch (hashAlgorithm) {
    case "SHA-1":
      return id_sha1
    case "SHA-224":
      return id_sha224
    case "SHA-256":
      return id_sha256
    case "SHA-384":
      return id_sha384
    case "SHA-512":
      return id_sha512
  }
}

export const HASH_FUNCTIONS: Record<HashAlgorithm, CHash> = {
  "SHA-1": sha1,
  "SHA-224": sha224,
  "SHA-256": sha256,
  "SHA-384": sha384,
  "SHA-512": sha512,
}
