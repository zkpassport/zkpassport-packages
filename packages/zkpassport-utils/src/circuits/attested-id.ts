import { sha256 } from "@noble/hashes/sha2.js"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { packBeBytesIntoFields } from "../utils"
import { Binary } from "../binary"
import { PassportViewModel } from "../types"
import { hashSaltDg1Dg2HashPrivateNullifier, normalizeDg2Hash } from "./index"
import { ProofData } from "./index"

/**
 * The base proof of a Tier 2 verification: an ID read by camera, with no chip to sign its
 * data, where the device's App Attest attestation of the DG1 it read and the portrait it
 * matched stands in for the chip's signatures. These are the TypeScript twins of
 * `lib/commitment/attested-to-disclosure` in the circuits repo.
 */
export const ATTESTED_ID_CIRCUIT_NAME = "attested_id_ios"

/**
 * A passport read by camera has no chip, so it is stored without a SOD. That absence is how
 * the circuits side tells the two apart: its base proof is the attested_id circuit instead of
 * the three chip proofs, and its nullifier and DG2 hash come from the attestation.
 */
export const isChiplessPassport = (passport: PassportViewModel) => !passport.sod

/** SHA-256 of the portrait the face was matched against, for a passport read by camera */
export function getPortraitHash(passport: PassportViewModel): Uint8Array {
  return sha256(Binary.fromBase64(passport.originalPhoto).toUInt8Array())
}

/** The circuits' DG1 input size; a TD3 DG1 is 93 bytes and gets zero-padded to it */
export const DG1_INPUT_LENGTH = 95

/** The DG2 hash type the attested digest is recorded as: SHA-256 */
export const ATTESTED_DIGEST_HASH_TYPE = 3

/** Every Android attested_id circuit name starts with it; the rest names the attestation chain */
export const ATTESTED_ID_ANDROID_CIRCUIT_PREFIX = "attested_id_android"

export const isAndroidAttestedIdCircuit = (circuitName: string) =>
  circuitName.startsWith(ATTESTED_ID_ANDROID_CIRCUIT_PREFIX)

/**
 * The attested_id proof returns (comm_out, param_commitment, credential_scheme). The Android one
 * also takes current_date as its one public input, before them, so the verifier can check the
 * proof is recent.
 */
export function getAttestedIdProofPublicInputCount(circuitName?: string): number {
  return circuitName && isAndroidAttestedIdCircuit(circuitName) ? 4 : 3
}

// The outputs are the last three public inputs on either platform
export function getCommitmentOutFromAttestedIdProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 3])
}

export function getParameterCommitmentFromAttestedIdProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 2])
}

/** The date an Android attested_id proof was made for; iOS ones carry none */
export function getCurrentDateFromAttestedIdProof(proofData: ProofData): Date | undefined {
  if (proofData.publicInputs.length < 4) return undefined
  return new Date(Number(BigInt(proofData.publicInputs[0])) * 1000)
}

export type AndroidAttestationCertificate = {
  type: "rsa" | "ecdsa"
  bitSize: number
  /** The hash its issuer signed it with */
  hashAlgorithm: "sha1" | "sha224" | "sha256" | "sha384" | "sha512"
}

/**
 * The Android attested_id circuit for an attestation chain, named as the circuits repo generates
 * it. `intermediates` go from the root down; each one's `hashAlgorithm` is the one the
 * certificate below it was signed with.
 */
export function getAttestedIdAndroidCircuitName({
  rootType,
  intermediates,
}: {
  rootType: "rsa" | "ecdsa"
  intermediates: AndroidAttestationCertificate[]
}): string {
  const chain = intermediates.map(
    ({ type, bitSize, hashAlgorithm }) =>
      `ik_${type === "rsa" ? "rsa_" : "ecdsa_p"}${bitSize}_${hashAlgorithm}`,
  )
  return `${ATTESTED_ID_ANDROID_CIRCUIT_PREFIX}_rk_${rootType}_ik_count_${intermediates.length}_${chain.join("_")}`
}

export function padDg1(dg1: Uint8Array): Uint8Array {
  if (dg1.length > DG1_INPUT_LENGTH) {
    throw new Error(
      `DG1 is ${dg1.length} bytes, more than the ${DG1_INPUT_LENGTH} the circuits take`,
    )
  }
  const padded = new Uint8Array(DG1_INPUT_LENGTH)
  padded.set(dg1)
  return padded
}

/**
 * The digest the device attests for a camera-read ID, in the slot a chip ID's DG2 hash takes:
 * SHA-256 over the padded DG1 followed by the SHA-256 of the portrait.
 */
export function calculateAttestedDigest(dg1: Uint8Array, portraitHash: Uint8Array): Uint8Array {
  if (portraitHash.length !== 32) throw new Error("The portrait hash must be a SHA-256 digest")
  const input = new Uint8Array(DG1_INPUT_LENGTH + 32)
  input.set(padDg1(dg1))
  input.set(portraitHash, DG1_INPUT_LENGTH)
  return sha256(input)
}

/** An ID card (TD1) fills the last two bytes the DG1 input takes; a passport (TD3) leaves them 0 */
const isIdCardDg1 = (dg1: Uint8Array) => dg1[93] !== 0 && dg1[94] !== 0

/** Where each MRZ field starts, as the circuits' utils read them */
const mrzLayout = (dg1: Uint8Array) =>
  isIdCardDg1(dg1)
    ? { documentNumber: 5, dateOfBirth: 30, expiryDate: 38 }
    : { documentNumber: 44, dateOfBirth: 57, expiryDate: 65 }

/** The issuing country as the circuits read it: Germany writes "D<<", which they read as DEU */
function getIssuingCountry(mrz: Uint8Array): Uint8Array {
  const country = mrz.subarray(2, 5)
  return String.fromCharCode(...country) === "D<<" ? new TextEncoder().encode("DEU") : country
}

/** The document number as the nullifier takes it: up to 24 characters */
const NULLIFIER_DOCUMENT_NUMBER_LENGTH = 24
const FILLER = 60 // "<"

/**
 * The whole document number. A TD1 number longer than 9 characters leaves its check digit
 * position empty and continues in the optional data (ICAO 9303-5), which is then taken as well;
 * otherwise the rest is filler. Sub-national documents (US driving licences) put their
 * subdivision code first, since their numbers are unique only within it.
 */
function getFullDocumentNumber(dg1: Uint8Array): Uint8Array {
  const mrz = dg1.subarray(5)
  const start = mrzLayout(dg1).documentNumber
  const number = new Uint8Array(NULLIFIER_DOCUMENT_NUMBER_LENGTH).fill(FILLER)
  number.set(mrz.subarray(start, start + 9))
  if (isIdCardDg1(dg1) && mrz[14] === FILLER) {
    number.set(mrz.subarray(15, 15 + NULLIFIER_DOCUMENT_NUMBER_LENGTH - 9), 9)
  }
  return number
}

/** The MRZ fields the nullifier is made of, from a passport or ID card DG1 */
/**
 * Prefixed to the Tier 2 nullifier's fields, so no table built for another system hashing the same
 * document fields applies to it, and its nullifiers never coincide with another scheme's
 */
const TIER2_NULLIFIER_DOMAIN = new TextEncoder().encode("ATTESTED_ID")

function getTier2NullifierFields(dg1: Uint8Array): Uint8Array {
  const padded = padDg1(dg1)
  const mrz = padded.subarray(5)
  const layout = mrzLayout(padded)
  const d = TIER2_NULLIFIER_DOMAIN.length
  const fields = new Uint8Array(d + 3 + NULLIFIER_DOCUMENT_NUMBER_LENGTH + 6 + 6)
  fields.set(TIER2_NULLIFIER_DOMAIN)
  fields.set(getIssuingCountry(mrz), d)
  fields.set(getFullDocumentNumber(padded), d + 3)
  fields.set(
    mrz.subarray(layout.dateOfBirth, layout.dateOfBirth + 6),
    d + 3 + NULLIFIER_DOCUMENT_NUMBER_LENGTH,
  )
  fields.set(
    mrz.subarray(layout.expiryDate, layout.expiryDate + 6),
    d + 9 + NULLIFIER_DOCUMENT_NUMBER_LENGTH,
  )
  return fields
}

/**
 * A camera-read ID has no signature to derive a nullifier from, so it comes from the MRZ fields
 * every document has and OCR reads reliably: issuing country, and the whole document number,
 * date of birth and expiry date, which carry check digits. The same document always gives the
 * same nullifier; names are left out, as OCR may read them differently each time.
 */
export async function calculateTier2PrivateNullifier(dg1: Uint8Array): Promise<bigint> {
  const packed = packBeBytesIntoFields(getTier2NullifierFields(dg1), 31)
  return poseidon2HashAsync(packed.map((x) => BigInt(x)))
}

/** The expiry date as the MRZ writes it, YYMMDD, from a passport or ID card DG1 */
export function getExpiryDateFromDg1(dg1: Uint8Array): string {
  const padded = padDg1(dg1)
  const start = mrzLayout(padded).expiryDate
  return String.fromCharCode(...padded.subarray(5 + start, 5 + start + 6))
}

/**
 * The commitment the attested_id circuit outputs, which the disclosure circuits take as
 * `comm_in`. Same shape as the one from the integrity check circuit of a chip ID.
 */
export async function calculateAttestedIdCommitment(
  salts: {
    dg1Salt: bigint
    expiryDateSalt: bigint
    dg2HashSalt: bigint
    privateNullifierSalt: bigint
  },
  dg1: Uint8Array,
  portraitHash: Uint8Array,
): Promise<{ commitment: bigint; privateNullifier: bigint }> {
  const privateNullifier = await calculateTier2PrivateNullifier(dg1)
  const digest = calculateAttestedDigest(dg1, portraitHash)
  const commitment = await hashSaltDg1Dg2HashPrivateNullifier(
    salts,
    Binary.from(padDg1(dg1)),
    getExpiryDateFromDg1(dg1),
    await normalizeDg2Hash(Array.from(digest)),
    ATTESTED_DIGEST_HASH_TYPE,
    privateNullifier,
  )
  return { commitment: commitment.toBigInt(), privateNullifier }
}
