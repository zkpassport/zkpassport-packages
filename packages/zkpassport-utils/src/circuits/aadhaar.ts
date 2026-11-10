import { sha256 } from "@noble/hashes/sha2.js"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { decompressSync } from "fflate"
import { redcLimbsFromBytes } from "../barrett-reduction"
import { leftPadArrayWithZeros } from "../utils"
import { Binary } from "../binary"
import { CredentialScheme, PassportViewModel } from "../types"
import {
  hashSaltDg1Dg2HashPrivateNullifier,
  normalizeDg2Hash,
  packLeBytesAndHashPoseidon2,
  ProofData,
} from "./index"

/**
 * Aadhaar's Secure QR code, printed on the Aadhaar card and letter and shown by the mAadhaar
 * app, as the `aadhaar_id` base proof reads it. These are the TypeScript twins of
 * `lib/aadhaar` in the circuits repo.
 *
 * The QR code holds a decimal number whose bytes are compressed data: fields separated by 255,
 * then the photo (JPEG 2000), then UIDAI's RSA-2048 PKCS#1 v1.5 SHA-256 signature over
 * everything before it. V2 data starts with "V2" and carries the last 4 digits of the mobile
 * number before the photo. V1 has neither, and ends its signed data with the SHA-256 of the
 * email and/or mobile number.
 */
export const AADHAAR_CIRCUIT_NAME = "aadhaar_id"
export const AADHAAR_MAX_DATA_LENGTH = 2048
export const AADHAAR_MAX_PHOTO_LENGTH = 1536
export const AADHAAR_DELIMITER_COUNT = 18
export const AADHAAR_SIGNATURE_LENGTH = 256
/** Domain separator of the Aadhaar private nullifier ("AADHAAR") */
export const AADHAAR_NULLIFIER_DOMAIN = 0x41414448414152n
export const PROOF_TYPE_AADHAAR = 12n
/** Aadhaar has no expiry, so the MRZ gets the signing date plus this many years */
export const AADHAAR_VALIDITY_YEARS = 10
/** Aadhaar is issued to residents, not only citizens: unspecified nationality */
export const AADHAAR_NATIONALITY = "XXX"
export const AADHAAR_ISSUING_COUNTRY = "IND"
/** The photo hash goes in the DG2 hash slot as SHA-256 */
export const AADHAAR_PHOTO_HASH_TYPE = 3

const DELIMITER = 255
const DG1_HEADER = [0x61, 0x5b, 0x5f, 0x1f, 0x58]
const DG1_INPUT_LENGTH = 95
const MRZ_NAME_LENGTH = 39
const NAME_MAX_LENGTH = 64

export type UidaiPublicKey = {
  /** UIDAI's file name for the certificate */
  name: string
  /** RSA modulus, big-endian hex */
  modulus: string
  validFrom: string
  validTo: string
}

/**
 * UIDAI's offline signing keys. A QR code stays signed by the key that was current when it was
 * made, so a card printed years ago still needs the key of its time.
 */
export const UIDAI_PUBLIC_KEYS: UidaiPublicKey[] = [
  {
    name: "uidai_prod_cdup",
    modulus:
      "bf41e36c5a6fbbf911fa04c8dbeb2f18d996e1e6478535411bf37e6f26aadc61f448333e8cee515b805b5cdcda48a734239988c8dd6f41fd8a98d57fdd76a2e8ca248a266b0517ccf1ae3def308cb5e1d303348fd4bd039a8854b81421fecd617ea448216a5f12eee7a16d86f2da0ad1939047513416d8a758db6a11ebb194d10a81fc64378fef47382f185c3e3cf7281b9b8c75c77bfc38c31358b6d33993fb9e4380806b9de0b0ad6ee720cd0c77704f39357c881c338dd55c7431e132d4a98bd50a507c3cd2c0d1669ef2801e19d109a14b108c0a0f60eca3c7618f8f5510b6b05ade6410baaed9882fe1cc50f7224420aa3192f1ddfeb14520fdee566bff",
    validFrom: "2017-06-08",
    validTo: "2020-06-07",
  },
  {
    name: "uidai_offline_publickey_26022021",
    modulus:
      "a2722c0e5f2de5ba707ed93f036ec2b1f0b955932390facc0f0bcbf20c80a15c088b4886866b72eb25ab0bf55a2fe06b69edbd5cc83b74c7709db2141e6c07c68bcdf859d3daf7f3fced241d072055dc15488474b45c2c982fa954aa52aa6fffb2481861c65085d84b64158e9f43d9f35ca69b48ce9300522102a4cae093bffd474b08d32d1d0406f687f7e55bd226a2384bf58a41c384c3974f1c7c5115819c926de3adf3ecbb9904c486f1f5d5303977bea63584367329b5c168afdc95121731f7f48d43af7cf31f69b1e3bbe7949dc7a8b10c0bddebababdebea076a1cf8166adf06a8a41dedf143bff835dbd2bd5bb0b61d2472c234a6d4411bc9b536095",
    validFrom: "2021-02-26",
    validTo: "2024-02-27",
  },
  {
    name: "uidai_offline_publickey_17022026",
    modulus:
      "98c2092a3dbc25c4cdd41ef6a76fe98330c2a20ba1b3fadb21780dff26cd361d0d54ead95762a596b993e5539894cac0069bc8a7b254fe7ea199adff3b5e27ee7be7809ff2ddca2587cae4ee6b03c1500eed9b950fe182cdf6983cb2e4512fb0a87eccec5387227fe9c89a35464c66f7c94edddca8c7946e2c6d94aa6ec97d52289a6d2ded0289a0ce6b7fc24dbcf5ddc2cc4df3d796953d817fb045fff1b714a885ed91dfbc8cb2aad7bfde8ad1446fccf3442a2eb0cfd5121e39ae776538082d773240e6f6c993aa347de2376b92291b2eb0d3b5ed3a3914e6f627d1dde7020cb83bf7cf0e0c593aca016b936289fdd1049e1912afd5de4040d46dd31e5d4b",
    validFrom: "2024-02-21",
    validTo: "2026-02-16",
  },
]

export type AadhaarQrData = {
  /** The decompressed QR data without its signature */
  signedData: Uint8Array
  signature: Uint8Array
}

export type AadhaarData = {
  version: 1 | 2
  /** 0 none, 1 email, 2 mobile, 3 both */
  emailMobileIndicator: number
  /** The last 4 digits of the Aadhaar number */
  aadhaarLastDigits: string
  /** When UIDAI signed the QR code, from its reference ID, as YYYYMMDDHHMMSSsss */
  signedAt: string
  name: string
  /** DD-MM-YYYY */
  dateOfBirth: string
  gender: string
  address: {
    careOf: string
    district: string
    landmark: string
    house: string
    location: string
    pinCode: string
    postOffice: string
    state: string
    street: string
    subDistrict: string
    vtc: string
  }
  mobileLastDigits?: string
  photo: Uint8Array
  /** The first 18 delimiters' indices, as the circuit takes them (V1 uses 16) */
  delimiterIndices: number[]
}

function bigintToBytes(value: bigint): Uint8Array {
  let hex = value.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  return Binary.fromHex(hex).toUInt8Array()
}

function bytesToBigint(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? 0n : BigInt(`0x${Binary.from(bytes).toHex().replace(/^0x/, "")}`)
}

/** The QR code's decimal text to its signed data and signature */
export function decodeAadhaarQr(qrText: string): AadhaarQrData {
  const text = qrText.trim()
  if (!/^\d+$/.test(text)) throw new Error("Not an Aadhaar Secure QR code")
  let data: Uint8Array
  try {
    data = decompressSync(bigintToBytes(BigInt(text)))
  } catch {
    throw new Error("Not an Aadhaar Secure QR code")
  }
  if (data.length <= AADHAAR_SIGNATURE_LENGTH) throw new Error("Not an Aadhaar Secure QR code")
  return {
    signedData: data.subarray(0, data.length - AADHAAR_SIGNATURE_LENGTH),
    signature: data.subarray(data.length - AADHAAR_SIGNATURE_LENGTH),
  }
}

/** The inverse of decodeAadhaarQr, compressed with zlib as UIDAI does; for tests */
export async function encodeAadhaarQr(
  signedData: Uint8Array,
  signature: Uint8Array,
): Promise<string> {
  const { zlibSync } = await import("fflate")
  const data = new Uint8Array(signedData.length + signature.length)
  data.set(signedData)
  data.set(signature, signedData.length)
  return bytesToBigint(zlibSync(data)).toString(10)
}

const decodeText = (bytes: Uint8Array) => String.fromCharCode(...bytes)

/** Reads the fields of the signed QR data */
export function parseAadhaarData(signedData: Uint8Array): AadhaarData {
  const version = signedData[0] === 86 && signedData[1] === 50 && signedData[2] === 255 ? 2 : 1
  if (version === 1 && !(signedData[0] >= 48 && signedData[0] <= 57 && signedData[1] === 255)) {
    throw new Error("Unsupported Aadhaar QR version")
  }
  const delimiterCount = version === 2 ? 18 : 16
  const delimiterIndices: number[] = []
  for (let i = 0; i < signedData.length && delimiterIndices.length < 18; i++) {
    if (signedData[i] === DELIMITER) delimiterIndices.push(i)
  }
  if (delimiterIndices.length < delimiterCount) throw new Error("Malformed Aadhaar QR data")
  if (delimiterIndices[delimiterCount - 1] >= 1024) throw new Error("Malformed Aadhaar QR data")
  const field = (position: number) => {
    const start = position === 0 ? 0 : delimiterIndices[position - 1] + 1
    return decodeText(signedData.subarray(start, delimiterIndices[position]))
  }
  const o = version === 2 ? 1 : 0
  const emailMobileIndicator = Number(field(o))
  const referenceId = field(o + 1)
  const hashLength =
    version === 2 ? 0 : emailMobileIndicator === 3 ? 64 : emailMobileIndicator === 0 ? 0 : 32
  const photo = signedData.subarray(
    delimiterIndices[delimiterCount - 1] + 1,
    signedData.length - hashLength,
  )
  return {
    version,
    emailMobileIndicator,
    aadhaarLastDigits: referenceId.slice(0, 4),
    signedAt: referenceId.slice(4),
    name: field(o + 2),
    dateOfBirth: field(o + 3),
    gender: field(o + 4),
    address: {
      careOf: field(o + 5),
      district: field(o + 6),
      landmark: field(o + 7),
      house: field(o + 8),
      location: field(o + 9),
      pinCode: field(o + 10),
      postOffice: field(o + 11),
      state: field(o + 12),
      street: field(o + 13),
      subDistrict: field(o + 14),
      vtc: field(o + 15),
    },
    mobileLastDigits: version === 2 ? field(17) : undefined,
    photo,
    delimiterIndices: [...delimiterIndices, ...Array(18 - delimiterIndices.length).fill(0)],
  }
}

/** The signed data of a V2 QR code with these fields; for tests and mock IDs */
export function buildAadhaarSignedData(
  fields: Pick<AadhaarData, "aadhaarLastDigits" | "signedAt" | "name" | "dateOfBirth" | "gender"> &
    Partial<Pick<AadhaarData, "address" | "mobileLastDigits" | "emailMobileIndicator">>,
  photo: Uint8Array,
): Uint8Array {
  const address = fields.address ?? {
    careOf: "",
    district: "",
    landmark: "",
    house: "",
    location: "",
    pinCode: "",
    postOffice: "",
    state: "",
    street: "",
    subDistrict: "",
    vtc: "",
  }
  const text = [
    "V2",
    String(fields.emailMobileIndicator ?? 0),
    `${fields.aadhaarLastDigits}${fields.signedAt}`,
    fields.name,
    fields.dateOfBirth,
    fields.gender,
    address.careOf,
    address.district,
    address.landmark,
    address.house,
    address.location,
    address.pinCode,
    address.postOffice,
    address.state,
    address.street,
    address.subDistrict,
    address.vtc,
    fields.mobileLastDigits ?? "0000",
  ]
  const header = text.flatMap((value) => [...new TextEncoder().encode(value), DELIMITER])
  const data = new Uint8Array(header.length + photo.length)
  data.set(header)
  data.set(photo, header.length)
  return data
}

/** ICAO 9303 check digit */
export function mrzCheckDigit(chars: string): string {
  const weights = [7, 3, 1]
  let sum = 0
  for (let i = 0; i < chars.length; i++) {
    const c = chars.charCodeAt(i)
    const value = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 90 ? c - 55 : 0
    sum += value * weights[i % 3]
  }
  return String(sum % 10)
}

/**
 * The name as the MRZ writes it: upper case, words separated by one '<', other characters
 * dropped, cut to 39 characters. The whole name is the primary identifier.
 */
export function aadhaarNameToMrz(name: string): string {
  let out = ""
  let afterSeparator = true
  for (const char of Array.from(new TextEncoder().encode(name)).slice(0, NAME_MAX_LENGTH)) {
    if ((char >= 97 && char <= 122) || (char >= 65 && char <= 90)) {
      out += String.fromCharCode(char >= 97 ? char - 32 : char)
      afterSeparator = false
    } else if ((char === 32 || char === 45 || char === 44) && !afterSeparator) {
      out += "<"
      afterSeparator = true
    }
  }
  return out.slice(0, MRZ_NAME_LENGTH).padEnd(MRZ_NAME_LENGTH, "<")
}

/** The expiry the MRZ gets: the signing date plus 10 years, YYMMDD */
export function getAadhaarExpiryDate(signedAt: string): string {
  const year = (Number(signedAt.slice(2, 4)) + AADHAAR_VALIDITY_YEARS) % 100
  return `${String(year).padStart(2, "0")}${signedAt.slice(4, 8)}`
}

/** The 88-character TD3 MRZ the circuit builds from the Aadhaar data */
export function aadhaarToMrz(aadhaar: AadhaarData): string {
  const name = aadhaarNameToMrz(aadhaar.name)
  const documentNumber = `XXXXX${aadhaar.aadhaarLastDigits}`
  const [day, month, year] = aadhaar.dateOfBirth.split("-")
  const dob = `${year.slice(2)}${month}${day}`
  const gender = aadhaar.gender === "M" || aadhaar.gender === "F" ? aadhaar.gender : "<"
  const expiry = getAadhaarExpiryDate(aadhaar.signedAt)
  const optional = "<".repeat(14)
  const line1 = `ID${AADHAAR_ISSUING_COUNTRY}${name}`
  const line2Start = `${documentNumber}${mrzCheckDigit(documentNumber)}${AADHAAR_NATIONALITY}${dob}${mrzCheckDigit(dob)}${gender}${expiry}${mrzCheckDigit(expiry)}${optional}${mrzCheckDigit(optional)}`
  const composite = line2Start.slice(0, 10) + line2Start.slice(13, 20) + line2Start.slice(21, 43)
  return `${line1}${line2Start}${mrzCheckDigit(composite)}`
}

/** The DG1 the circuit builds, zero-padded to the circuits' DG1 input length */
export function aadhaarToDg1(aadhaar: AadhaarData): Uint8Array {
  const dg1 = new Uint8Array(DG1_INPUT_LENGTH)
  dg1.set(DG1_HEADER)
  dg1.set(new TextEncoder().encode(aadhaarToMrz(aadhaar)), DG1_HEADER.length)
  return dg1
}

export function getAadhaarPhotoHash(aadhaar: AadhaarData): Uint8Array {
  return sha256(aadhaar.photo)
}

export async function calculateAadhaarPrivateNullifier(photoHash: Uint8Array): Promise<bigint> {
  return poseidon2HashAsync([
    AADHAAR_NULLIFIER_DOMAIN,
    await normalizeDg2Hash(Array.from(photoHash)),
  ])
}

/** The commitment the aadhaar_id circuit outputs, which the disclosure circuits take as comm_in */
export async function calculateAadhaarCommitment(
  salts: {
    dg1Salt: bigint
    expiryDateSalt: bigint
    dg2HashSalt: bigint
    privateNullifierSalt: bigint
  },
  aadhaar: AadhaarData,
): Promise<{ commitment: bigint; privateNullifier: bigint }> {
  const photoHash = getAadhaarPhotoHash(aadhaar)
  const privateNullifier = await calculateAadhaarPrivateNullifier(photoHash)
  const commitment = await hashSaltDg1Dg2HashPrivateNullifier(
    salts,
    Binary.from(aadhaarToDg1(aadhaar)),
    getAadhaarExpiryDate(aadhaar.signedAt),
    await normalizeDg2Hash(Array.from(photoHash)),
    AADHAAR_PHOTO_HASH_TYPE,
    privateNullifier,
  )
  return { commitment: commitment.toBigInt(), privateNullifier }
}

const modulusBytes = (modulus: string | Uint8Array) =>
  typeof modulus === "string" ? Binary.fromHex(modulus).toUInt8Array() : modulus

/** The parameter commitment of an aadhaar_id proof made against a UIDAI key */
export async function getAadhaarParameterCommitment(modulus: string | Uint8Array): Promise<bigint> {
  return poseidon2HashAsync([
    PROOF_TYPE_AADHAAR,
    await packLeBytesAndHashPoseidon2(modulusBytes(modulus)),
  ])
}

/** The parameter commitments of every known UIDAI key */
export async function getUidaiParameterCommitments(
  keys: UidaiPublicKey[] = UIDAI_PUBLIC_KEYS,
): Promise<bigint[]> {
  return Promise.all(keys.map((key) => getAadhaarParameterCommitment(key.modulus)))
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n
  base %= modulus
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus
    base = (base * base) % modulus
    exponent >>= 1n
  }
  return result
}

// DER DigestInfo prefix for SHA-256 in PKCS#1 v1.5
const SHA256_DIGEST_INFO = "3031300d060960864801650304020105000420"

/** Checks an RSA PKCS#1 v1.5 SHA-256 signature, as the circuit does, with exponent 65537 */
export function verifyAadhaarSignature(qr: AadhaarQrData, modulus: string | Uint8Array): boolean {
  const n = bytesToBigint(modulusBytes(modulus))
  const decrypted = modPow(bytesToBigint(qr.signature), 65537n, n).toString(16).padStart(512, "0")
  const digest = Binary.from(sha256(qr.signedData)).toHex().replace(/^0x/, "")
  const expected = `0001${"ff".repeat(256 - 3 - 19 - 32)}00${SHA256_DIGEST_INFO}${digest}`
  return decrypted === expected
}

/** The known UIDAI key that signed the QR code, if any */
export function findUidaiPublicKey(
  qr: AadhaarQrData,
  keys: UidaiPublicKey[] = UIDAI_PUBLIC_KEYS,
): UidaiPublicKey | undefined {
  return keys.find((key) => verifyAadhaarSignature(qr, key.modulus))
}

const toBase64 = (bytes: Uint8Array) => Binary.from(bytes).toBase64()

export const isAadhaarPassport = (passport: PassportViewModel) =>
  passport.credentialScheme === CredentialScheme.UIDAI_AADHAAR

export function getAadhaarQrDataFromPassport(passport: PassportViewModel): AadhaarQrData {
  if (!passport.aadhaar) throw new Error("Not an Aadhaar")
  return {
    signedData: Binary.fromBase64(passport.aadhaar.signedData).toUInt8Array(),
    signature: Binary.fromBase64(passport.aadhaar.signature).toUInt8Array(),
  }
}

export function getAadhaarDataFromPassport(passport: PassportViewModel): AadhaarData {
  return parseAadhaarData(getAadhaarQrDataFromPassport(passport).signedData)
}

/**
 * An Aadhaar as the app keeps an ID: its MRZ is the one the circuit builds, its photo the one
 * in the QR code (JPEG 2000), and the QR data itself is kept for the base proof.
 */
export function aadhaarToPassportViewModel(
  qr: AadhaarQrData,
  publicKey: UidaiPublicKey | string,
): PassportViewModel {
  const aadhaar = parseAadhaarData(qr.signedData)
  const mrz = aadhaarToMrz(aadhaar)
  const dg1 = aadhaarToDg1(aadhaar).subarray(0, 93)
  const [day, month, year] = aadhaar.dateOfBirth.split("-")
  const photo = toBase64(aadhaar.photo)
  const name = aadhaar.name.trim()
  return {
    mrz,
    credentialScheme: CredentialScheme.UIDAI_AADHAAR,
    name,
    fullName: name,
    firstName: name,
    lastName: "",
    // As the MRZ writes dates, YYMMDD, like every stored ID
    dateOfBirth: `${year.slice(2)}${month}${day}`,
    nationality: AADHAAR_NATIONALITY,
    gender: aadhaar.gender === "M" || aadhaar.gender === "F" ? aadhaar.gender : "",
    passportNumber: `XXXXX${aadhaar.aadhaarLastDigits}`,
    dateOfIssue: aadhaar.signedAt.slice(2, 8),
    passportExpiry: getAadhaarExpiryDate(aadhaar.signedAt),
    // JPEG 2000, which the app converts for display and face matching
    photo: `data:image/jp2;base64,${photo}`,
    originalPhoto: photo,
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: [
      {
        groupNumber: 1,
        name: "DG1",
        hash: Array.from(sha256(dg1)),
        value: Array.from(dg1),
      },
      {
        groupNumber: 2,
        name: "DG2",
        hash: Array.from(getAadhaarPhotoHash(aadhaar)),
        value: [],
      },
    ],
    dataGroupsHashAlgorithm: "SHA256",
    sod: undefined as unknown as PassportViewModel["sod"],
    appVersion: "",
    aadhaar: {
      signedData: toBase64(qr.signedData),
      signature: toBase64(qr.signature),
      publicKey: typeof publicKey === "string" ? publicKey : publicKey.modulus,
    },
  }
}

/** The aadhaar_id circuit's inputs */
export function getAadhaarCircuitInputs(
  passport: PassportViewModel,
  salts: {
    dg1Salt: bigint
    expiryDateSalt: bigint
    dg2HashSalt: bigint
    privateNullifierSalt: bigint
  },
) {
  const qr = getAadhaarQrDataFromPassport(passport)
  if (qr.signedData.length > AADHAAR_MAX_DATA_LENGTH) {
    throw new Error("The Aadhaar QR data is larger than the circuit takes")
  }
  const aadhaar = parseAadhaarData(qr.signedData)
  if (aadhaar.photo.length > AADHAAR_MAX_PHOTO_LENGTH) {
    throw new Error("The Aadhaar photo is larger than the circuit takes")
  }
  const pubkey = Array.from(modulusBytes(passport.aadhaar!.publicKey))
  const qrData = new Array(AADHAAR_MAX_DATA_LENGTH).fill(0)
  qrData.splice(0, qr.signedData.length, ...qr.signedData)
  const hex = (value: bigint) => `0x${value.toString(16)}`
  return {
    qr_data: qrData,
    qr_data_length: qr.signedData.length,
    delimiter_indices: aadhaar.delimiterIndices,
    signature: Array.from(qr.signature),
    pubkey,
    pubkey_redc_param: leftPadArrayWithZeros(redcLimbsFromBytes(pubkey), 257),
    dg1_salt: hex(salts.dg1Salt),
    expiry_date_salt: hex(salts.expiryDateSalt),
    dg2_hash_salt: hex(salts.dg2HashSalt),
    private_nullifier_salt: hex(salts.privateNullifierSalt),
  }
}

/** The aadhaar_id proof returns (comm_out, param_commitment, credential_scheme) */
export const getAadhaarProofPublicInputCount = () => 3

export function getCommitmentOutFromAadhaarProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export function getParameterCommitmentFromAadhaarProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[1])
}
