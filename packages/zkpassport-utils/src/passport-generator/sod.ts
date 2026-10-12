import { createHash } from "node:crypto"
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
import { id_sha1, id_sha224, id_sha256, id_sha384, id_sha512 } from "@peculiar/asn1-rsa"
import { AlgorithmIdentifier, Certificate, SubjectKeyIdentifier } from "@peculiar/asn1-x509"
import { Binary } from "../binary"
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
  const nodeHashAlgorithm = hashAlgorithm.toLowerCase().replace("-", "")

  const dg1Hash = createHash(nodeHashAlgorithm).update(dg1.toBuffer()).digest()
  const encapContentInfo = generateEncapContentInfo(dg1Hash, hashAlgorithm)
  const eContentHash = Binary.from(
    createHash(nodeHashAlgorithm)
      .update(Binary.from(encapContentInfo.eContent!.single!.buffer).toBuffer())
      .digest(),
  )

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

function generateSignedAttrs(eContentHash: Binary) {
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
      AsnConvert.serialize(
        AsnOctetStringConverter.toASN(new Uint8Array(eContentHash.toUInt8Array()).buffer),
      ),
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
