import { id_ecdsaWithSHA256, id_ecdsaWithSHA384, id_ecdsaWithSHA512 } from "@peculiar/asn1-ecc"
import {
  id_sha256WithRSAEncryption,
  id_sha384WithRSAEncryption,
  id_sha512WithRSAEncryption,
} from "@peculiar/asn1-rsa"
import { AsnConvert, AsnSerializer, OctetString } from "@peculiar/asn1-schema"
import { AlgorithmIdentifier, Certificate } from "@peculiar/asn1-x509"
import { Binary, SOD, type PassportViewModel } from "@zkpassport/utils"
import { AttributeSet } from "../cms/asn"
import type { HashAlgorithm } from "../passport-generator"
import {
  generateSod,
  getRsaPssSignatureAlgorithm,
  wrapSodInContentInfo,
} from "../passport-generator/sod"
import DSCS from "./dscs.json"
import { sign, type SignatureScheme } from "./sign"

/** The DSC that signs a mock passport's SOD: its key, and the hash algorithm it signs with */
export type MockPassportSignature =
  | "rsa-2048-sha256"
  | "rsa-3072-sha384"
  | "rsa-4096-sha512"
  | "rsa-pss-4096-sha512"
  | "ecdsa-p256-sha256"
  | "ecdsa-p384-sha384"
  | "ecdsa-p521-sha512"

export type MockPassportOptions = {
  firstName?: string
  /** Empty for none */
  middleName?: string
  lastName?: string
  gender?: "M" | "F" | "<"
  /** ICAO alpha-3 code */
  nationality?: string
  dateOfBirth?: Date
  /** A past date makes the circuits reject the passport */
  expiryDate?: Date
  documentNumber?: string
  signature?: MockPassportSignature
}

const DEFAULTS: Required<MockPassportOptions> = {
  firstName: "John",
  middleName: "Miller",
  lastName: "Smith",
  gender: "M",
  nationality: "ZKR",
  dateOfBirth: new Date("1995-11-12"),
  expiryDate: new Date("2035-01-01"),
  documentNumber: "ZP1111111",
  signature: "rsa-2048-sha256",
}

const SIGNATURES: Record<
  MockPassportSignature,
  { scheme: SignatureScheme; hashAlgorithm: HashAlgorithm; algorithm: AlgorithmIdentifier }
> = {
  "rsa-2048-sha256": {
    scheme: "rsa-pkcs1",
    hashAlgorithm: "SHA-256",
    algorithm: new AlgorithmIdentifier({ algorithm: id_sha256WithRSAEncryption }),
  },
  "rsa-3072-sha384": {
    scheme: "rsa-pkcs1",
    hashAlgorithm: "SHA-384",
    algorithm: new AlgorithmIdentifier({ algorithm: id_sha384WithRSAEncryption }),
  },
  "rsa-4096-sha512": {
    scheme: "rsa-pkcs1",
    hashAlgorithm: "SHA-512",
    algorithm: new AlgorithmIdentifier({ algorithm: id_sha512WithRSAEncryption }),
  },
  "rsa-pss-4096-sha512": {
    scheme: "rsa-pss",
    hashAlgorithm: "SHA-512",
    algorithm: getRsaPssSignatureAlgorithm("SHA-512"),
  },
  "ecdsa-p256-sha256": {
    scheme: "ecdsa-p256",
    hashAlgorithm: "SHA-256",
    algorithm: new AlgorithmIdentifier({ algorithm: id_ecdsaWithSHA256 }),
  },
  "ecdsa-p384-sha384": {
    scheme: "ecdsa-p384",
    hashAlgorithm: "SHA-384",
    algorithm: new AlgorithmIdentifier({ algorithm: id_ecdsaWithSHA384 }),
  },
  "ecdsa-p521-sha512": {
    scheme: "ecdsa-p521",
    hashAlgorithm: "SHA-512",
    algorithm: new AlgorithmIdentifier({ algorithm: id_ecdsaWithSHA512 }),
  },
}

// The DG1 template ('61') and its MRZ data object ('5F1F'), each with its length: 91 and 88 bytes
// for a TD3 MRZ. ICAO Doc 9303 Part 10 (8th edition, 2021), section 4.7.1, table 39:
// https://www.icao.int/sites/default/files/publications/DocSeries/9303_p10_cons_en.pdf
const DG1_HEADER = "615B5F1F58"

/**
 * Build a passport of the Zero Knowledge Republic (ZKR), whose DSCs chain to the ZKR CSCAs in the
 * testnet certificate registry. Options default to John Miller Smith's passport. The same options
 * give the same passport. The MRZ's check digits are `_`, and the passport has no photo.
 */
export function createMockPassport(options: MockPassportOptions = {}): PassportViewModel {
  const holder = { ...DEFAULTS, ...options }
  const mrz = buildMrz(holder)
  const dg1 = Binary.fromHex(DG1_HEADER).concat(Binary.from(mrz))

  const { scheme, hashAlgorithm, algorithm } = SIGNATURES[holder.signature]
  const dsc = DSCS[holder.signature]
  const certificate = AsnConvert.parse(
    Binary.fromBase64(dsc.certificate).toUInt8Array(),
    Certificate,
  )
  const { sod } = generateSod(dg1, [certificate], hashAlgorithm, algorithm)

  const signerInfo = sod.signerInfos[0]
  const signedAttrs = AsnConvert.serialize(new AttributeSet(signerInfo.signedAttrs!.map((a) => a)))
  const privateKey = Binary.fromBase64(dsc.privateKey).toUInt8Array()
  signerInfo.signature = new OctetString(
    sign(new Uint8Array(signedAttrs), privateKey, scheme, hashAlgorithm),
  )

  const encoded = new Uint8Array(AsnSerializer.serialize(wrapSodInContentInfo(sod)))
  return buildPassport(holder, mrz, dg1, SOD.fromDER(Binary.from(encoded)))
}

function buildMrz(holder: Required<MockPassportOptions>) {
  const givenNames = [holder.firstName, holder.middleName].filter(Boolean).map(toMrzText)
  const names = `${toMrzText(holder.lastName)}<<${givenNames.join("<")}`
  const nationality = toMrzText(holder.nationality)
  if (nationality.length !== 3) {
    throw new Error(`Nationality must be an alpha-3 code, got ${holder.nationality}`)
  }

  return (
    `P<ZKR${padField(names, 39)}` +
    `${padField(toMrzText(holder.documentNumber), 9)}_${nationality}` +
    `${toYYMMDD(holder.dateOfBirth)}_${holder.gender}${toYYMMDD(holder.expiryDate)}_` +
    "<".repeat(16)
  )
}

function buildPassport(
  holder: Required<MockPassportOptions>,
  mrz: string,
  dg1: Binary,
  sod: SOD,
): PassportViewModel {
  return {
    appVersion: "",
    mrz,
    name: `${holder.firstName} ${holder.lastName}`,
    fullName: [holder.firstName, holder.middleName, holder.lastName].filter(Boolean).join(" "),
    firstName: holder.firstName,
    lastName: holder.lastName,
    dateOfBirth: toYYMMDD(holder.dateOfBirth),
    nationality: holder.nationality,
    gender: holder.gender,
    passportNumber: holder.documentNumber,
    dateOfIssue: "",
    passportExpiry: toYYMMDD(holder.expiryDate),
    photo: "",
    originalPhoto: "",
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    // Hashes come from the SOD; only DG1 is filled in
    dataGroups: Object.entries(sod.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, hash]) => ({
        groupNumber: Number(key),
        name: `DG${key}`,
        hash: hash.toNumberArray(),
        value: key === "1" ? dg1.toNumberArray() : [],
      }),
    ),
    dataGroupsHashAlgorithm: sod.encapContentInfo.eContent.hashAlgorithm,
    sod,
  }
}

function toMrzText(text: string) {
  const mrzText = text.toUpperCase().replace(/[ -]/g, "<")
  if (!/^[A-Z0-9<]*$/.test(mrzText)) {
    throw new Error(`${text} has characters an MRZ can't hold`)
  }
  return mrzText
}

function padField(field: string, length: number) {
  if (field.length > length) {
    throw new Error(`${field} is longer than its MRZ field, ${length} characters`)
  }
  return field.padEnd(length, "<")
}

function toYYMMDD(date: Date) {
  return [date.getUTCFullYear() % 100, date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("")
}
