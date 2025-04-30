import { DigestAlgorithm, PassportViewModel } from "../../src/types"
import { Binary } from "../../src/binary"

import johnSODJson from "./john-miller-smith-rsa-2048-sha256.json"
import marySODJson from "./mary-miller-smith-ecdsa-p256-sha256.json"
import { SOD } from "../../src"
import { sha256, sha384, sha512 } from "@noble/hashes/sha2"

const hash = (hashAlgorithm: DigestAlgorithm, msg: Uint8Array) => {
  switch (hashAlgorithm) {
    case "SHA256":
      return sha256(msg)
    case "SHA384":
      return sha384(msg)
    case "SHA512":
      return sha512(msg)
    default:
      throw new Error(`Unsupported hash algorithm: ${hashAlgorithm}`)
  }
}

const johnSOD = SOD.fromDER(Binary.fromBase64(johnSODJson.encoded))
// John Miller Smith's MRZ
const johnMRZ =
  "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<"
const johnDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(johnMRZ))

const marySOD = SOD.fromDER(Binary.fromBase64(marySODJson.encoded))
// Mary Miller Smith's MRZ
const maryMRZ =
  "P<ZKRSMITH<<MARY<MILLER<<<<<<<<<<<<<<<<<<<<<ZP2222222_ZKR750302_F300101_<<<<<<<<<<<<<<<<"
const maryDG1 = Binary.fromHex("615B5F1F58").concat(Binary.from(maryMRZ))

export const PASSPORTS: {
  [key: string]: PassportViewModel
} = {
  john: {
    appVersion: "",
    mrz: johnMRZ,
    name: "John Smith",
    dateOfBirth: "951112",
    nationality: "ZKR",
    gender: "M",
    passportNumber: "ZP1111111",
    passportExpiry: "350101",
    firstName: "John",
    lastName: "Smith",
    fullName: "John Miller Smith",
    photo: "",
    originalPhoto: "",
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: [
      {
        groupNumber: 1,
        name: "DG1",
        hash: Binary.from(sha256(johnDG1.toUInt8Array())).toNumberArray(),
        value: johnDG1.toNumberArray(),
      },
      {
        groupNumber: 2,
        name: "DG2",
        hash: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0,
        ],
        value: [],
      },
    ],
    dataGroupsHashAlgorithm: "SHA256",
    sod: johnSOD,
    sodVersion: "3",
    signedAttributes: johnSOD.signerInfo.signedAttrs.bytes.toNumberArray(),
    signedAttributesHashAlgorithm: "SHA256",
    eContent: johnSOD.encapContentInfo.eContent.bytes.toNumberArray(),
    eContentHash: Binary.from(
      hash(
        johnSOD.encapContentInfo.eContent.hashAlgorithm,
        johnSOD.encapContentInfo.eContent.bytes.toUInt8Array(),
      ),
    ).toHex(),
    eContentHashAlgorithm: johnSOD.encapContentInfo.eContent.hashAlgorithm,
    tbsCertificate: johnSOD.certificate.tbs.bytes.toNumberArray(),
    dscSignatureAlgorithm: johnSOD.certificate.signatureAlgorithm.name,
    dscSignature: johnSOD.certificate.signature.toNumberArray(),
    sodSignature: johnSOD.signerInfo.signature.toNumberArray(),
    sodSignatureAlgorithm: johnSOD.signerInfo.signatureAlgorithm.name,
  },
  mary: {
    appVersion: "",
    mrz: maryMRZ,
    name: "Mary Smith",
    dateOfBirth: "750302",
    nationality: "ZKR",
    gender: "F",
    passportNumber: "ZP2222222",
    passportExpiry: "300101",
    firstName: "Mary",
    lastName: "Smith",
    fullName: "Mary Miller Smith",
    photo: "",
    originalPhoto: "",
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: [
      {
        groupNumber: 1,
        name: "DG1",
        hash: Binary.from(sha256(maryDG1.toUInt8Array())).toNumberArray(),
        value: maryDG1.toNumberArray(),
      },
      {
        groupNumber: 2,
        name: "DG2",
        hash: [
          0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          0, 0,
        ],
        value: [],
      },
    ],
    dataGroupsHashAlgorithm: "SHA256",
    sod: marySOD,
    sodVersion: "3",
    signedAttributes: marySOD.signerInfo.signedAttrs.bytes.toNumberArray(),
    signedAttributesHashAlgorithm: "SHA256",
    eContent: marySOD.encapContentInfo.eContent.bytes.toNumberArray(),
    eContentHash: Binary.from(
      hash(
        marySOD.encapContentInfo.eContent.hashAlgorithm,
        marySOD.encapContentInfo.eContent.bytes.toUInt8Array(),
      ),
    ).toHex(),
    eContentHashAlgorithm: marySOD.encapContentInfo.eContent.hashAlgorithm,
    tbsCertificate: marySOD.certificate.tbs.bytes.toNumberArray(),
    dscSignatureAlgorithm: marySOD.certificate.signatureAlgorithm.name,
    dscSignature: marySOD.certificate.signature.toNumberArray(),
    sodSignature: marySOD.signerInfo.signature.toNumberArray(),
    sodSignatureAlgorithm: marySOD.signerInfo.signatureAlgorithm.name,
  },
}
