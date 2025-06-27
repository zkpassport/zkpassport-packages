import { AsnParser, AsnSerializer } from "@peculiar/asn1-schema"
import { Binary } from "../binary"
import { getOIDName } from "../cms/oids"
import type { PublicKeyType, SignatureAlgorithm } from "../cms/types"
import { Certificate } from "@peculiar/asn1-x509"
import { formatDN } from "./common"

export type DSCData = {
  // TBS (To-Be-Signed) certificate
  // The region of the DSC signed by the CSC
  tbs: {
    // Version of this TBS certificate
    // Specifies certificate format and types of fields/extensions supported
    version: number
    // The serial number of this TBS certificate, which uniquely identifies it within the issuing authority
    serialNumber: Binary

    // Hash and signature algorithm used by the CSC to sign this TBS certificate (e.g. sha256WithRSAEncryption)
    // Actual signature is stored at SOD.certificate.signature
    // This field is the same as the SOD.certificate.signatureAlgorithm field
    // While in most cases the two fields will match, it is possible they may not, indicating a malformed or tampered certificate
    // This field should be ignored, because the SOD.certificate.signatureAlgorithm field indicates which algorithm the CSC decided to use
    // TODO: Consider removing this field
    signatureAlgorithm: {
      name: SignatureAlgorithm
      parameters?: Binary
    }

    // Distinguished name of the issuer of this TBS certificate (Matches the subject field of the CSC)
    issuer: string
    // Validity period of the TBS certificate, indicating the dates during which it is valid
    validity: { notBefore: Date; notAfter: Date }
    // Distinguished name of this TBS certificate (DSC)
    subject: string

    // Info about the DSC public key
    subjectPublicKeyInfo: {
      // Type of public key (e.g. rsaEncryption, ecPublicKey)
      signatureAlgorithm: {
        name: PublicKeyType
        parameters?: Binary
      }
      // The DSC public key
      subjectPublicKey: Binary
    }
    // Optional set of extensions providing additional information or capabilities for the TBS certificate
    // e.g. authorityKeyIdentifier, subjectKeyIdentifier, privateKeyUsagePeriod, cRLDistributionPoints, subjectAltName, documentTypeList, keyUsage, issuerAltName
    // extensions?: { id: string; critical?: boolean; value: Binary }[]
    extensions: Map<string, { critical?: boolean; value: Binary }>

    // Optional unique identifier for the issuer, used in cases where issuer's name is not unique
    // TODO: Consider removing this field
    issuerUniqueID?: Binary
    // Optional unique identifier for the subject, used in cases where subject's name is not unique
    // TODO: Consider removing this field
    subjectUniqueID?: Binary
    // The bytes of TBS certificate
    bytes: Binary
  }
  // Hash and signature algorithm used by the CSC to sign the TBS certificate (e.g. sha256WithRSAEncryption)
  // This field is the same as the TBS certificate.signatureAlgorithm field
  // While in most cases the two fields will match, it is possible they may not, indicating a malformed or tampered certificate
  // This field indicates which algorithm the CSC decided to use, and therefore TBS certificate.signatureAlgorithm should be ignored
  signatureAlgorithm: {
    name: SignatureAlgorithm
    parameters?: Binary
  }
  // Signature over the TBS certificate by the CSC
  // The actual signature used to verify the TBS certificate
  signature: Binary
}

export class DSC implements DSCData {
  tbs: {
    version: number
    serialNumber: Binary
    signatureAlgorithm: {
      name: SignatureAlgorithm
      parameters?: Binary
    }
    issuer: string
    validity: { notBefore: Date; notAfter: Date }
    subject: string
    subjectPublicKeyInfo: {
      signatureAlgorithm: {
        name: PublicKeyType
        parameters?: Binary
      }
      subjectPublicKey: Binary
    }
    extensions: Map<string, { critical?: boolean; value: Binary }>
    issuerUniqueID?: Binary
    subjectUniqueID?: Binary
    bytes: Binary
  }
  signatureAlgorithm: {
    name: SignatureAlgorithm
    parameters?: Binary
  }
  signature: Binary

  constructor(dsc: DSCData) {
    this.tbs = dsc.tbs
    this.signatureAlgorithm = dsc.signatureAlgorithm
    this.signature = dsc.signature
  }

  static fromDER(der: Binary): DSC {
    der = der.slice(0, 2).equals(Binary.from([119, 130])) ? der.slice(4) : der

    const certificate = AsnParser.parse(der.toUInt8Array(), Certificate)
    return DSC.fromCertificate(certificate)
  }

  static fromCertificate(certificate: Certificate): DSC {
    const tbs = certificate.tbsCertificate
    if (!tbs) throw new Error("No TBS found in DSC certificate")

    return {
      tbs: {
        bytes: Binary.from(AsnSerializer.serialize(tbs)),
        version: tbs.version,
        serialNumber: Binary.from(tbs.serialNumber),
        signatureAlgorithm: {
          name: getOIDName(tbs.signature.algorithm) as SignatureAlgorithm,
          parameters: tbs.signature.parameters ? Binary.from(tbs.signature.parameters) : undefined,
        },
        issuer: formatDN(tbs.issuer),
        validity: {
          notBefore: tbs.validity.notBefore.getTime(),
          notAfter: tbs.validity.notAfter.getTime(),
        },
        subject: formatDN(tbs.subject),
        subjectPublicKeyInfo: {
          signatureAlgorithm: {
            name: getOIDName(tbs.subjectPublicKeyInfo.algorithm.algorithm) as PublicKeyType,
            parameters: tbs.subjectPublicKeyInfo.algorithm.parameters
              ? Binary.from(tbs.subjectPublicKeyInfo.algorithm.parameters)
              : undefined,
          },
          subjectPublicKey: Binary.from(tbs.subjectPublicKeyInfo.subjectPublicKey),
        },
        issuerUniqueID: tbs.issuerUniqueID ? Binary.from(tbs.issuerUniqueID) : undefined,
        subjectUniqueID: tbs.subjectUniqueID ? Binary.from(tbs.subjectUniqueID) : undefined,
        extensions: new Map<string, { critical?: boolean; value: Binary }>(
          tbs.extensions?.map((v) => [
            getOIDName(v.extnID),
            { critical: v.critical, value: Binary.from(v.extnValue.buffer) },
          ]) ?? [],
        ),
      },
      signatureAlgorithm: {
        name: getOIDName(certificate.signatureAlgorithm.algorithm) as SignatureAlgorithm,
        parameters: certificate.signatureAlgorithm.parameters
          ? Binary.from(certificate.signatureAlgorithm.parameters)
          : undefined,
      },
      signature: Binary.from(certificate.signatureValue),
    }
  }
}
