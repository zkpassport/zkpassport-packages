import { sha256 } from "@noble/hashes/sha2.js"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { decompressSync, zlibSync } from "fflate"
import { redcLimbsFromBytes } from "../barrett-reduction"
import { leftPadArrayWithZeros } from "../utils"
import { Binary } from "../binary"
import { mrzCheckDigit } from "../passport/td1"
import {
  CredentialScheme,
  IDCredentialConfig,
  PackagedCertificate,
  PackagedCertificatesFile,
  PassportViewModel,
  RSAPublicKey,
} from "../types"
import { computeMerkleProof } from "../merkle-tree"
import {
  buildMerkleTreeFromMasterlists,
  buildMerkleTreeFromRevocations,
  CERTIFICATE_MERKLE_TREE_HEIGHT,
  getCertificateLeafHash,
  getCertificateLeafHashes,
  getCertificateMerkleProofFromFile,
  PACKAGED_CERT_TYPE_UIDAI,
  tagsArrayToBitsFlag,
} from "../registry"
import { hashSaltDg1Dg2HashPrivateNullifier, normalizeDg2Hash, ProofData } from "./index"

export const AADHAAR_CIRCUIT_NAME = "aadhaar_id"
export const AADHAAR_MAX_DATA_LENGTH = 2048
export const AADHAAR_MAX_PHOTO_LENGTH = 1536
export const AADHAAR_DELIMITER_COUNT = 18
export const AADHAAR_SIGNATURE_LENGTH = 256
export const AADHAAR_NULLIFIER_DOMAIN = 0x41414448414152n
export const AADHAAR_VALIDITY_YEARS = 10
export const AADHAAR_NATIONALITY = "XXX"
export const AADHAAR_ISSUING_COUNTRY = "IND"
export const AADHAAR_PHOTO_HASH_TYPE = 3

const DELIMITER = 255
const BN254_SCALAR_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n
const DG1_HEADER = [0x61, 0x5b, 0x5f, 0x1f, 0x58]
const DG1_INPUT_LENGTH = 95
const MRZ_NAME_LENGTH = 39
const NAME_MAX_LENGTH = 64

export type UidaiPublicKey = {
  name: string
  modulus: string
  validFrom: string
  validTo: string
}

const normaliseModulus = (modulus: string) => modulus.toLowerCase().replace(/^0x/, "")

const toIsoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10)

export function getUidaiCertificates(
  packagedCerts: PackagedCertificatesFile,
): PackagedCertificate[] {
  return packagedCerts.certificates.filter(
    (cert) =>
      cert.type === PACKAGED_CERT_TYPE_UIDAI &&
      cert.country === AADHAAR_ISSUING_COUNTRY &&
      cert.public_key.type === "RSA",
  )
}

export function getUidaiPublicKeys(packagedCerts: PackagedCertificatesFile): UidaiPublicKey[] {
  return getUidaiCertificates(packagedCerts).map((cert) => ({
    name: cert.fingerprint ?? "",
    modulus: normaliseModulus((cert.public_key as RSAPublicKey).modulus),
    validFrom: toIsoDate(cert.validity.not_before),
    validTo: toIsoDate(cert.validity.not_after),
  }))
}

export type AadhaarQrData = {
  signedData: Uint8Array
  signature: Uint8Array
}

export type AadhaarData = {
  version: 1 | 2
  emailMobileIndicator: number
  aadhaarLastDigits: string
  signedAt: string
  name: string
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

export function encodeAadhaarQr(signedData: Uint8Array, signature: Uint8Array): string {
  const data = new Uint8Array(signedData.length + signature.length)
  data.set(signedData)
  data.set(signature, signedData.length)
  return bytesToBigint(zlibSync(data)).toString(10)
}

const decodeText = (bytes: Uint8Array) => String.fromCharCode(...bytes)

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

export function getAadhaarExpiryDate(signedAt: string): string {
  const year = (Number(signedAt.slice(2, 4)) + AADHAAR_VALIDITY_YEARS) % 100
  return `${String(year).padStart(2, "0")}${signedAt.slice(4, 8)}`
}

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

const SHA256_DIGEST_INFO = "3031300d060960864801650304020105000420"

export function verifyAadhaarSignature(qr: AadhaarQrData, modulus: string | Uint8Array): boolean {
  const n = bytesToBigint(modulusBytes(modulus))
  const decrypted = modPow(bytesToBigint(qr.signature), 65537n, n).toString(16).padStart(512, "0")
  const digest = Binary.from(sha256(qr.signedData)).toHex().replace(/^0x/, "")
  const expected = `0001${"ff".repeat(256 - 3 - 19 - 32)}00${SHA256_DIGEST_INFO}${digest}`
  return decrypted === expected
}

export function findUidaiPublicKey(
  qr: AadhaarQrData,
  keys: UidaiPublicKey[],
): UidaiPublicKey | undefined {
  return keys.find((key) => verifyAadhaarSignature(qr, key.modulus))
}

const toBase64 = (bytes: Uint8Array) => Binary.from(bytes).toBase64()

// Aadhaar records no nationality, so it can only pass an exclusion list
export function isAadhaarNationalityConditionAllowed(config?: IDCredentialConfig): boolean {
  if (!config) return true
  return Object.entries(config).every(
    ([key, value]) => key === "out" || value === undefined || value === false,
  )
}

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
    dateOfBirth: `${year.slice(2)}${month}${day}`,
    nationality: AADHAAR_NATIONALITY,
    gender: aadhaar.gender === "M" || aadhaar.gender === "F" ? aadhaar.gender : "",
    passportNumber: `XXXXX${aadhaar.aadhaarLastDigits}`,
    dateOfIssue: aadhaar.signedAt.slice(2, 8),
    passportExpiry: getAadhaarExpiryDate(aadhaar.signedAt),
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

export async function getAadhaarCircuitInputs(
  passport: PassportViewModel,
  salts: {
    dg1Salt: bigint
    expiryDateSalt: bigint
    dg2HashSalt: bigint
    privateNullifierSalt: bigint
  },
  packagedCerts: PackagedCertificatesFile,
) {
  if (packagedCerts.version !== 1) {
    throw new Error(
      `getAadhaarCircuitInputs requires v1 packaged certificates (got version ${packagedCerts.version ?? 0})`,
    )
  }
  const qr = getAadhaarQrDataFromPassport(passport)
  if (qr.signedData.length > AADHAAR_MAX_DATA_LENGTH) {
    throw new Error("The Aadhaar QR data is larger than the circuit takes")
  }
  const aadhaar = parseAadhaarData(qr.signedData)
  if (aadhaar.photo.length > AADHAAR_MAX_PHOTO_LENGTH) {
    throw new Error("The Aadhaar photo is larger than the circuit takes")
  }
  const publicKey = normaliseModulus(passport.aadhaar!.publicKey)
  const certificate = getUidaiCertificates(packagedCerts).find(
    (cert) => normaliseModulus((cert.public_key as RSAPublicKey).modulus) === publicKey,
  )
  if (!certificate) throw new Error("The UIDAI key is not in the Certificate Registry")

  const revocationTree = await buildMerkleTreeFromRevocations(packagedCerts.revocations ?? [])
  const masterlistTree = await buildMerkleTreeFromMasterlists(packagedCerts.masterlists ?? [])
  const leaf = await getCertificateLeafHash(certificate, { version: packagedCerts.version })
  let merkleProof = await getCertificateMerkleProofFromFile(
    packagedCerts,
    leaf,
    revocationTree.root,
    masterlistTree.root,
  )
  if (!merkleProof) {
    const leaves = await getCertificateLeafHashes(packagedCerts.certificates, packagedCerts.version)
    merkleProof = await computeMerkleProof(
      leaves,
      leaves.findIndex((l) => l === leaf),
      CERTIFICATE_MERKLE_TREE_HEIGHT,
    )
  }

  const pubkey = Array.from(modulusBytes(publicKey))
  const qrData = new Array(AADHAAR_MAX_DATA_LENGTH).fill(0)
  qrData.splice(0, qr.signedData.length, ...qr.signedData)
  // Salts are SHA-256 outputs and may exceed the field, so they go in reduced as the prover would
  const hex = (value: bigint) => `0x${(value % BN254_SCALAR_FIELD).toString(16)}`
  return {
    certificate_registry_root: packagedCerts.root,
    schema_version: packagedCerts.version,
    timestamp: packagedCerts.timestamp,
    certificate_tree_index: merkleProof.index,
    certificate_tree_hash_path: merkleProof.path,
    certificate_tags: tagsArrayToBitsFlag(certificate.tags ?? []).map(
      (tag) => `0x${tag.toString(16)}`,
    ),
    uidai_cert_expiry: certificate.validity.not_after,
    uidai_cert_fingerprint: certificate.fingerprint!,
    revocation_tree_root: revocationTree.root,
    masterlist_tree_root: masterlistTree.root,
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

export const getAadhaarProofPublicInputCount = () => 3

export function getCertificateRegistryRootFromAadhaarProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export function getCommitmentOutFromAadhaarProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[1])
}
