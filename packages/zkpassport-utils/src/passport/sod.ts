import { ContentInfo, SignedData } from "@peculiar/asn1-cms"
import { AsnConvert, AsnParser, AsnSerializer } from "@peculiar/asn1-schema"
import { Binary } from "../binary"
import { AttributeSet, LDSSecurityObject, Time } from "../cms/asn"
import { decodeOID, getHashAlgorithmName, getOIDName } from "../cms/oids"
import type { DigestAlgorithm, PublicKeyType, SignatureAlgorithm } from "../cms/types"
import { DSC, DSCData } from "./dsc"
import { formatDN } from "./common"

export class DataGroupHashValues {
  public values: { [key: number]: Binary }

  constructor(values: { [key: number]: Binary }) {
    this.values = values
  }

  [Symbol.for("nodejs.util.inspect.custom")](): Map<number, Binary> {
    return new Map(Object.entries(this.values).map(([key, value]) => [Number(key), value]))
  }
}

// The Document Security Object (SOD) is implemented as a SignedData type as specified in Cryptographic Message Syntax (CMS) [RFC 3369]
export type SODSignedData = {
  // CMS version of the SOD
  // 0=v0, 1=v1, 2=v2, 3=v3, 4=v4, 5=v5
  version: number

  // Lists all the hash algorithms used in the SOD
  // These are the hash algorithms needed to verify the integrity of the passport
  // Includes the algorithms used to hash the:
  // - Data groups DG1-DG16 (hash algorithm specified at SOD.encapContentInfo.eContent.hashAlgorithm)
  // - SOD.encapContentInfo.eContent structure
  // - SOD.signerInfo.signedAttrs structure
  digestAlgorithms: DigestAlgorithm[]

  // Encapsulates the content that is being signed
  // For passports this is the hash of the data groups and the hash algorithm used to hash them
  encapContentInfo: {
    // The OID specifying the content type for eContent
    // Should always be mRTDSignatureData (2.23.136.1.1.1)
    // Corresponds with the value at SOD.signerInfo.signedAttrs.contentType
    eContentType: string
    // The encapsulated content
    // For ePassports this is ASN type LDSSecurityObject
    // Contains the concatenated hashes of the ePassport data groups
    eContent: {
      // LDSSecurityObject version: v0(0), v1(1)
      version: number
      // Hash algorithm used to hash the data groups
      hashAlgorithm: DigestAlgorithm
      // Mapping of data group numbers to their corresponding hash values
      dataGroupHashValues: DataGroupHashValues
      // The bytes of eContent
      bytes: Binary
    }
  }

  // Contains the signedAttrs region that is signed by the DSC (Document Signing Certificate)
  // Includes information about the signer, and the hashing and signing algorithms used for signing
  signerInfo: {
    // The CMS version of the signerInfo: v0(0), v1(1), v2(2), v3(3), v4(4), v5(5)
    version: number
    // The signedAttrs region that the DSC signs over
    // The resulting signature is stored at SOD.signerInfo.signature
    signedAttrs: {
      // The OID specifying the content type being signed
      // Should always be mRTDSignatureData (2.23.136.1.1.1)
      // Corresponds to eContent and is the same value as SOD.encapContentInfo.eContentType
      contentType: string
      // Hash of SOD.encapContentInfo.eContent using the SOD.signerInfo.digestAlgorithm hash algorithm
      messageDigest: Binary
      // Time the signature was created by the DSC
      signingTime?: Date
      // The bytes of signedAttrs
      bytes: Binary
    }
    // The hash algorithm used to produce the hash value over eContent and signedAttrs (e.g. sha256)
    // The resulting hash of eContent is stored at SOD.signerInfo.signedAttrs.messageDigest
    // The hashing algorithm used for signedAttrs will actually be the signatureAlgorithm specified at
    // SOD.signerInfo.signatureAlgorithm (e.g. sha256WithRSAEncryption) and should be used instead for hashing signedAttrs
    digestAlgorithm: DigestAlgorithm
    // The hash and signature algorithm used by the DSC to sign the signedAttrs (e.g. sha256WithRSAEncryption)
    signatureAlgorithm: {
      name: SignatureAlgorithm
      parameters?: Binary
    }
    // The signature over the signedAttrs by the DSC using SOD.signerInfo.signatureAlgorithm
    signature: Binary
    // Signer identifier used to identify the signer (the DSC)
    // Can be based on issuer and serial number, or subject key identifier
    sid: {
      // Distinguished name and serial number of the CSC that issued this TBS certificate
      issuerAndSerialNumber?: {
        // Distinguished name of the issuer of the DSC (Matches the subject field of the CSC)
        issuer: string
        // The serial number of the CSC
        serialNumber: Binary
      }
      // Subject Key Identifier
      // An alternative identifier derived from the signer's (the CSC) public key
      // TODO: Consider removing this field
      subjectKeyIdentifier?: string
    }
  }

  // The DSC (Document Signing Certificate) that is signed by the CSC (Country Signing Certificate)
  certificate: DSCData
  // The bytes of the SOD
  bytes: Binary
}

/*
 * The exportable SOD is the SOD with all the sensitive data stripped
 * So it can be exported without exposing the sensitive data
 */
export type ExportableSOD = {
  version: number
  digestAlgorithms: DigestAlgorithm[]
  encapContentInfo: {
    eContentType: string
    eContent: {
      version: number
      hashAlgorithm: DigestAlgorithm
      // Becomes the lengths of the dataGroupHashValues values
      dataGroupHashValues: { [key: number]: number }
      // Becomes the length of the eContent bytes
      bytes: number
    }
  }
  signerInfo: {
    version: number
    signedAttrs: {
      contentType: string
      // Becomes the length of the messageDigest bytes
      messageDigest: number
      signingTime?: Date
      // Becomes the length of the signedAttrs bytes
      bytes: number
    }
    digestAlgorithm: DigestAlgorithm
    signatureAlgorithm: {
      name: SignatureAlgorithm
      parameters?: Binary
    }
    // Becomes the length of the signature
    signature: number
    sid: {
      issuerAndSerialNumber?: {
        issuer: string
        // Becomes the length of the serialNumber
        serialNumber: number
      }
    }
  }
  // The DSC has no sensitive data, so we can just use the DSC class
  certificate: DSC
  // Becomes the length of the SOD bytes
  bytes: number
}

export class SOD implements SODSignedData {
  version: number
  digestAlgorithms: DigestAlgorithm[]
  encapContentInfo: {
    eContentType: string
    eContent: {
      version: number
      hashAlgorithm: DigestAlgorithm
      dataGroupHashValues: DataGroupHashValues
      bytes: Binary
    }
  }
  signerInfo: {
    version: number
    signedAttrs: {
      contentType: string
      messageDigest: Binary
      signingTime?: Date
      bytes: Binary
    }
    digestAlgorithm: DigestAlgorithm
    signatureAlgorithm: {
      name: SignatureAlgorithm
      parameters?: Binary
    }
    signature: Binary
    sid: {
      issuerAndSerialNumber?: {
        issuer: string
        serialNumber: Binary
      }
      subjectKeyIdentifier?: string
    }
  }
  // The DSC has no sensitive data, so we can just use the DSC class
  certificate: DSC
  bytes: Binary

  constructor(sod: SODSignedData) {
    this.version = sod.version
    this.digestAlgorithms = sod.digestAlgorithms
    this.certificate = sod.certificate
    this.signerInfo = sod.signerInfo
    this.bytes = sod.bytes
    this.encapContentInfo = sod.encapContentInfo
  }

  static fromDER(der: Binary): SOD {
    der = der.slice(0, 2).equals(Binary.from([119, 130])) ? der.slice(4) : der

    const contentInfo = AsnParser.parse(der.toUInt8Array(), ContentInfo)
    const signedData = AsnParser.parse(contentInfo.content, SignedData)
    if (!signedData.encapContentInfo?.eContent?.single) throw new Error("No eContent found")
    const eContent = AsnConvert.parse(
      signedData.encapContentInfo?.eContent?.single,
      LDSSecurityObject,
    )
    const certificates = signedData.certificates
    const cert = certificates?.[0]?.certificate
    if (!cert) throw new Error("No DSC certificate found")
    if ((certificates?.length ?? 0) > 1) console.warn("Warning: Found multiple DSC certificates")
    const signerInfo = signedData.signerInfos[0]
    if (signedData.signerInfos.length > 1) console.warn("Warning: Found multiple SignerInfos")
    if (!signerInfo.signedAttrs) throw new Error("No signedAttrs found")
    const signedAttrsMap = new Map<string, Binary>(
      signerInfo.signedAttrs.map((v) => [getOIDName(v.attrType), Binary.from(v.attrValues[0])]),
    )
    // Reconstruct signed attributes using AttributeSet to get the correct bytes that are signed
    const reconstructedSignedAttrs = new AttributeSet(signerInfo.signedAttrs.map((v) => v))
    const messageDigest = signedAttrsMap.get("messageDigest")
    if (!messageDigest) throw new Error("No signedAttrs.messageDigest found")
    const signingTimeAttr = signedAttrsMap.get("signingTime")
    const signingTime = signingTimeAttr
      ? AsnParser.parse(signingTimeAttr.toUInt8Array(), Time).getTime()
      : undefined
    const signedAttrs = {
      bytes: Binary.from(AsnSerializer.serialize(reconstructedSignedAttrs)),
      contentType: getOIDName(decodeOID(signedAttrsMap.get("contentType")!.toNumberArray())),
      messageDigest,
      ...(signingTime && { signingTime }),
    }

    return new SOD({
      bytes: der,
      version: signedData.version,

      digestAlgorithms: signedData.digestAlgorithms.map(
        (v) => getHashAlgorithmName(v.algorithm) as DigestAlgorithm,
      ),

      encapContentInfo: {
        eContentType: getOIDName(signedData.encapContentInfo.eContentType),
        eContent: {
          bytes: Binary.from(signedData.encapContentInfo.eContent.single.buffer),
          version: eContent.version,
          hashAlgorithm: getHashAlgorithmName(eContent.hashAlgorithm.algorithm) as DigestAlgorithm,
          dataGroupHashValues: new DataGroupHashValues(
            Object.fromEntries(
              eContent.dataGroups.map((v) => [v.number as number, Binary.from(v.hash)]),
            ),
          ),
        },
      },

      signerInfo: {
        version: signerInfo.version,
        signedAttrs: signedAttrs,
        digestAlgorithm: getHashAlgorithmName(
          signerInfo.digestAlgorithm.algorithm,
        ) as DigestAlgorithm,
        signatureAlgorithm: {
          name: getOIDName(signerInfo.signatureAlgorithm.algorithm) as SignatureAlgorithm,
          parameters: signerInfo.signatureAlgorithm.parameters
            ? Binary.from(signerInfo.signatureAlgorithm.parameters)
            : undefined,
        },
        signature: Binary.from(signerInfo.signature.buffer),
        sid: {
          issuerAndSerialNumber: signerInfo.sid.issuerAndSerialNumber
            ? {
                issuer: formatDN(signerInfo.sid.issuerAndSerialNumber.issuer),
                serialNumber: Binary.from(signerInfo.sid.issuerAndSerialNumber.serialNumber),
              }
            : undefined,
          subjectKeyIdentifier: signerInfo.sid.subjectKeyIdentifier
            ? Binary.from(signerInfo.sid.subjectKeyIdentifier.buffer).toString("hex")
            : undefined,
        },
      },

      certificate: DSC.fromCertificate(cert),
    })
  }

  /**
   * Get the exportable SOD
   * This is the SOD with all the sensitive data stripped
   * So it can be exported without exposing the sensitive data
   */
  getExportableSOD(): ExportableSOD {
    return {
      ...this,
      encapContentInfo: {
        ...this.encapContentInfo,
        eContent: {
          ...this.encapContentInfo.eContent,
          bytes: this.encapContentInfo.eContent.bytes.length,
          dataGroupHashValues: Object.fromEntries(
            Object.entries(this.encapContentInfo.eContent.dataGroupHashValues.values).map(
              ([key, value]) => [Number(key), value.length],
            ),
          ),
        },
      },
      signerInfo: {
        ...this.signerInfo,
        signedAttrs: {
          ...this.signerInfo.signedAttrs,
          messageDigest: this.signerInfo.signedAttrs.messageDigest.length,
          bytes: this.signerInfo.signedAttrs.bytes.length,
        },
        signature: this.signerInfo.signature.length,
        sid: {
          issuerAndSerialNumber: this.signerInfo.sid.issuerAndSerialNumber
            ? {
                issuer: this.signerInfo.sid.issuerAndSerialNumber.issuer,
                serialNumber: this.signerInfo.sid.issuerAndSerialNumber.serialNumber.length,
              }
            : undefined,
        },
      },
      bytes: this.bytes.length,
    }
  }

  /*[Symbol.for("nodejs.util.inspect.custom")](): string {
    let sod: SODSignedData = new SOD(this)
    if (!util) return "util is not available"
    return util.inspect(
      {
        version: sod.version,
        digestAlgorithms: sod.digestAlgorithms,
        encapContentInfo: {
          eContentType: sod.encapContentInfo.eContentType,
          eContent: {
            ...sod.encapContentInfo.eContent,
            bytes: "...",
          },
        },
        signerInfo: {
          ...sod.signerInfo,
          signedAttrs: {
            ...sod.signerInfo.signedAttrs,
            bytes: "...",
          },
        },
        certificate: {
          ...sod.certificate,
          tbs: {
            ...sod.certificate.tbs,
            bytes: "...",
          },
        },
      },
      { depth: null, colors: true },
    )
  }*/
}
