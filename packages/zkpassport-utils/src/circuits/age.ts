import { packBeBytesIntoField, numberToBytesBE } from "../utils"
import { AgeCommittedInputs } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { sha256 } from "@noble/hashes/sha2"
import { ProofType } from "."

export function getMinAgeFromCommittedInputs(committedInputs: AgeCommittedInputs): number {
  return committedInputs.minAge
}

export function getMaxAgeFromCommittedInputs(committedInputs: AgeCommittedInputs): number {
  return committedInputs.maxAge
}

/**
 * Get the number of public inputs for the age proof.
 * @returns The number of public inputs.
 */
export function getAgeProofPublicInputCount(): number {
  return 5
}

/**
 * Get the parameter commitment for the age proof.
 * @param currentDateTimestamp - The current timestamp (seconds since UNIX epoch)
 * @param minAge - The minimum age.
 * @param maxAge - The maximum age.
 * @returns The parameter commitment.
 */
export async function getAgeParameterCommitment(
  currentDateTimestamp: number,
  minAge: number,
  maxAge: number,
): Promise<bigint> {
  const ageParameterCommitment = await poseidon2HashAsync([
    BigInt(ProofType.AGE),
    BigInt(currentDateTimestamp),
    BigInt(minAge),
    BigInt(maxAge),
  ])
  return ageParameterCommitment
}

/**
 * Get the EVM parameter commitment for the age proof.
 * @param currentDateTimestamp - The current timestamp (seconds since UNIX epoch)
 * @param minAge - The minimum age.
 * @param maxAge - The maximum age.
 * @returns The parameter commitment.
 */
export async function getAgeEVMParameterCommitment(
  currentDateTimestamp: number,
  minAge: number,
  maxAge: number,
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([ProofType.AGE, ...numberToBytesBE(currentDateTimestamp, 8), minAge, maxAge]),
  )
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
