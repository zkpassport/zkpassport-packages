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

/** Domain separator of the Tier 2 private nullifier ("TIER2"), so it never collides with a chip one */
export const TIER2_NULLIFIER_DOMAIN = 0x5449455232n

/** The DG2 hash type the attested digest is recorded as: SHA-256 */
export const ATTESTED_DIGEST_HASH_TYPE = 3

/** The attested_id proof returns (comm_out, param_commitment, credential_scheme), no public inputs */
export function getAttestedIdProofPublicInputCount(): number {
  return 3
}

export function getCommitmentOutFromAttestedIdProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export function getParameterCommitmentFromAttestedIdProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[1])
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

/** The MRZ fields of a TD3 passport DG1 that carry a check digit: the nullifier is made of these */
function getTier2NullifierFields(dg1: Uint8Array): Uint8Array {
  const mrz = padDg1(dg1).subarray(5)
  const fields = new Uint8Array(3 + 9 + 6)
  fields.set(mrz.subarray(2, 5)) // issuing country
  fields.set(mrz.subarray(44, 53), 3) // document number
  fields.set(mrz.subarray(57, 63), 12) // date of birth
  return fields
}

/**
 * A camera-read ID has no signature to derive a nullifier from, so it comes from the MRZ fields
 * that carry a check digit: issuing country, document number and date of birth. Names have no
 * check digit and OCR may read them differently each time, so they are left out.
 */
export async function calculateTier2PrivateNullifier(dg1: Uint8Array): Promise<bigint> {
  const [packed] = packBeBytesIntoFields(getTier2NullifierFields(dg1), 31)
  return poseidon2HashAsync([TIER2_NULLIFIER_DOMAIN, BigInt(packed)])
}

/** The expiry date as the MRZ writes it, YYMMDD, from a TD3 passport DG1 */
export function getExpiryDateFromTd3Dg1(dg1: Uint8Array): string {
  const mrz = padDg1(dg1).subarray(5)
  return String.fromCharCode(...mrz.subarray(65, 71))
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
    getExpiryDateFromTd3Dg1(dg1),
    await normalizeDg2Hash(Array.from(digest)),
    ATTESTED_DIGEST_HASH_TYPE,
    privateNullifier,
  )
  return { commitment: commitment.toBigInt(), privateNullifier }
}
