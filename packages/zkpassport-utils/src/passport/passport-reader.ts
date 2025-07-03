import { ContentInfo, SignedData } from "@peculiar/asn1-cms"
import { AsnParser } from "@peculiar/asn1-schema"
import { TBSCertificate } from "@peculiar/asn1-x509"
import { Binary } from "../binary"
import { HASH_OIDS } from "../cms/constants"
import { decodeOID } from "../cms/oids"
import type { DigestAlgorithm } from "../cms/types"
import { PassportViewModel } from "../types"
import { SOD } from "./sod"
import { getRSAPSSParams } from "../cms"
import { DSC } from "./dsc"

export class PassportReader {
  public dg1?: Binary
  public sod?: SOD

  getPassportViewModel(): PassportViewModel {
    if (this.dg1 === undefined || this.sod === undefined) {
      throw new Error("PassportReader not initialized")
    }
    const isIDCard = this.dg1.length === 95
    const mrz = this.dg1.slice(5).toString("ascii")
    // TODO: Implement the remaining properties
    return {
      appVersion: "",
      mrz: mrz,
      name: mrz.slice(isIDCard ? 60 : 5, isIDCard ? 90 : 44),
      dateOfBirth: mrz.slice(isIDCard ? 30 : 57, isIDCard ? 36 : 63),
      nationality: mrz.slice(isIDCard ? 45 : 54, isIDCard ? 48 : 57),
      gender: mrz.slice(isIDCard ? 37 : 64, isIDCard ? 38 : 65),
      passportNumber: mrz.slice(isIDCard ? 5 : 44, isIDCard ? 14 : 53),
      dateOfIssue: "",
      passportExpiry: mrz.slice(isIDCard ? 38 : 65, isIDCard ? 44 : 71),
      firstName: "",
      lastName: "",
      fullName: mrz.slice(isIDCard ? 60 : 5, isIDCard ? 90 : 44),
      photo: "",
      originalPhoto: "",

      chipAuthSupported: false,
      chipAuthSuccess: false,
      chipAuthFailed: false,

      LDSVersion: "",

      // TODO: Add support for other data groups
      dataGroups: Object.entries(this.sod.encapContentInfo.eContent.dataGroupHashValues.values).map(
        ([key, value]) => ({
          groupNumber: Number(key),
          name: "DG" + key,
          hash: value.toNumberArray(),
          value: key === "1" ? (this.dg1?.toNumberArray() ?? []) : [],
        }),
      ),
      dataGroupsHashAlgorithm: this.sod.encapContentInfo.eContent.hashAlgorithm,

      sod: this.sod,
    }
  }

  public loadPassport(dg1: Binary, sod: Binary) {
    this.sod = SOD.fromDER(sod)
    this.dg1 = dg1
  }
}

export function getSODContent(passport: PassportViewModel): SignedData {
  const cert = AsnParser.parse(passport.sod.bytes.toBuffer(), ContentInfo)
  const signedData = AsnParser.parse(cert.content, SignedData)
  return signedData
}

export function getEContentHashAlgorithm(passport: PassportViewModel): string {
  const eContent = getEContent(passport)
  const oidOffset = 9
  const oidLength = eContent[oidOffset + 1]
  const oidBytes = eContent.slice(oidOffset, oidOffset + oidLength + 2)
  return HASH_OIDS[decodeOID(oidBytes) as keyof typeof HASH_OIDS] ?? ""
}

export function getEContent(passport: PassportViewModel): number[] {
  const signedData = getSODContent(passport)
  return Array.from(
    new Uint8Array(signedData.encapContentInfo.eContent?.single?.buffer ?? new ArrayBuffer(0)),
  )
}

export function getSignedAttributesHashingAlgorithm(passport: PassportViewModel): string {
  const signedData = getSODContent(passport)
  return HASH_OIDS[signedData.digestAlgorithms[0].algorithm as keyof typeof HASH_OIDS] ?? ""
}

export function getSODCMSVersion(passport: PassportViewModel): string {
  const signedData = getSODContent(passport)
  return signedData.version.toString()
}

export function extractTBS(passport: PassportViewModel): TBSCertificate | null {
  const signedData = getSODContent(passport)
  const tbsCertificate = signedData.certificates
    ? signedData.certificates[0]?.certificate?.tbsCertificate
    : null
  return tbsCertificate ?? null
}

export function getSodSignatureAlgorithmType(passport: PassportViewModel): "RSA" | "ECDSA" | "" {
  if (passport.sod.signerInfo.signatureAlgorithm.name?.toLowerCase().includes("rsa")) {
    return "RSA"
  } else if (passport.sod.signerInfo.signatureAlgorithm.name?.toLowerCase().includes("ecdsa")) {
    return "ECDSA"
  }
  return ""
}

export function getSodSignatureHashAlgorithm(
  passport: PassportViewModel,
): DigestAlgorithm | undefined {
  return passport.sod.signerInfo.digestAlgorithm
}

/**
 * @deprecated This function will be removed in a future version
 */
export function getDSCSignatureAlgorithmType(passport: PassportViewModel): "RSA" | "ECDSA" | "" {
  if (passport.sod.certificate.signatureAlgorithm.name?.toLowerCase().includes("rsa")) {
    return "RSA"
  } else if (passport.sod.certificate.signatureAlgorithm.name?.toLowerCase().includes("ecdsa")) {
    return "ECDSA"
  }
  return ""
}

export function getDSCSignatureHashAlgorithm(dsc: DSC): DigestAlgorithm | undefined {
  if (dsc.signatureAlgorithm.name.toLowerCase().includes("pss")) {
    const params = getRSAPSSParams(dsc.signatureAlgorithm.parameters?.toBuffer()! as BufferSource)
    return params.hashAlgorithm
  }

  if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha1")) {
    return "SHA1"
  } else if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha224")) {
    return "SHA224"
  } else if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha256")) {
    return "SHA256"
  } else if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha384")) {
    return "SHA384"
  } else if (dsc.signatureAlgorithm.name?.toLowerCase().includes("sha512")) {
    return "SHA512"
  }
}
