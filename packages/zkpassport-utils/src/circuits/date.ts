import { sha256 } from "@noble/hashes/sha2"
import { DateCommittedInputs } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { packBeBytesIntoField } from "../utils"
import { ProofType } from "."
import { numberToBytesBE } from "@noble/curves/utils"

export function getMinDateFromCommittedInputs(committedInputs: DateCommittedInputs): Date {
  return new Date(committedInputs.minDateTimestamp * 1000)
}

export function getMaxDateFromCommittedInputs(committedInputs: DateCommittedInputs): Date {
  return new Date(committedInputs.maxDateTimestamp * 1000)
}

/**
 * Get the number of public inputs for the date proof.
 * @returns The number of public inputs.
 */
export function getDateProofPublicInputCount(): number {
  return 5
}

/**
 * Get the parameter commitment for the date proof (birthdate and expiry date alike).
 * @param proofType - The proof type.
 * @param currentDateTimestamp - The current timestamp (seconds since UNIX epoch)
 * @param minDateTimestamp - The minimum date (seconds since UNIX epoch)
 * @param maxDateTimestamp - The maximum date (seconds since UNIX epoch)
 * @returns The parameter commitment.
 */
export async function getDateParameterCommitment(
  proofType: ProofType,
  currentDateTimestamp: number,
  minDateTimestamp: number,
  maxDateTimestamp: number,
): Promise<bigint> {
  const birthdateParameterCommitment = await poseidon2HashAsync([
    BigInt(proofType),
    BigInt(currentDateTimestamp),
    BigInt(minDateTimestamp),
    BigInt(maxDateTimestamp),
  ])
  return birthdateParameterCommitment
}

/**
 * Get the EVM parameter commitment for the date proof (birthdate and expiry date alike).
 * @param proofType - The proof type.
 * @param timestamp - The current timestamp (seconds since UNIX epoch)
 * @param minDateTimestamp - The minimum date (seconds since UNIX epoch)
 * @param maxDateTimestamp - The maximum date (seconds since UNIX epoch)
 * @returns The parameter commitment.
 */
export async function getDateEVMParameterCommitment(
  proofType: ProofType,
  currentDateTimestamp: number,
  minDateTimestamp: number,
  maxDateTimestamp: number,
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([
      proofType,
      ...numberToBytesBE(currentDateTimestamp, 4),
      ...numberToBytesBE(minDateTimestamp, 4),
      ...numberToBytesBE(maxDateTimestamp, 4),
    ]),
  )
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
