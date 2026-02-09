import { packBeBytesIntoField, numberToBytesBE } from "../utils"
import { AgeCommittedInputs } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { sha256 } from "@noble/hashes/sha2.js"
import { ProofType, ProofTypeLength } from "."

export function getMinAgeFromCommittedInputs(committedInputs: AgeCommittedInputs): number {
  return committedInputs.minAge
}

export function getMaxAgeFromCommittedInputs(committedInputs: AgeCommittedInputs): number {
  return committedInputs.maxAge
}

/**
 * Get the parameter commitment for the age proof.
 * @param currentDateTimestamp - The current timestamp (seconds since UNIX epoch)
 * @param minAge - The minimum age.
 * @param maxAge - The maximum age.
 * @returns The parameter commitment.
 */
export async function getAgeParameterCommitment(minAge: number, maxAge: number): Promise<bigint> {
  const ageParameterCommitment = await poseidon2HashAsync([
    BigInt(ProofType.AGE),
    BigInt(ProofTypeLength[ProofType.AGE].standard),
    BigInt(minAge),
    BigInt(maxAge),
  ])
  return ageParameterCommitment
}

/**
 * Get the EVM parameter commitment for the age proof.
 * @param minAge - The minimum age.
 * @param maxAge - The maximum age.
 * @returns The parameter commitment.
 */
export async function getAgeEVMParameterCommitment(
  minAge: number,
  maxAge: number,
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([
      ProofType.AGE,
      ...numberToBytesBE(ProofTypeLength[ProofType.AGE].evm, 2),
      minAge,
      maxAge,
    ]),
  )
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
