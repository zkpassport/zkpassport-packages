import { sha256 } from "@noble/hashes/sha2"
import { DateCommittedInputs } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { packBeBytesIntoField } from "../utils"
import { ProofType } from "."
import { numberToBytesBE } from "@noble/curves/utils"

export const SECONDS_BETWEEN_1900_AND_1970 = Math.floor(
  Math.abs(Date.UTC(1900, 0, 1, 0, 0, 0)) / 1000,
)

export function getMinDateFromCommittedInputs(committedInputs: DateCommittedInputs): Date {
  return new Date(committedInputs.minDateTimestamp * 1000)
}

export function getMaxDateFromCommittedInputs(committedInputs: DateCommittedInputs): Date {
  return new Date(committedInputs.maxDateTimestamp * 1000)
}

export function getBirthdateMinDateTimestamp(committedInputs: DateCommittedInputs): Date {
  return new Date(
    getMinDateFromCommittedInputs(committedInputs).getTime() + SECONDS_BETWEEN_1900_AND_1970 * 1000,
  )
}

export function getBirthdateMaxDateTimestamp(committedInputs: DateCommittedInputs): Date {
  return new Date(
    getMaxDateFromCommittedInputs(committedInputs).getTime() + SECONDS_BETWEEN_1900_AND_1970 * 1000,
  )
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
 * @param minDateTimestamp - The minimum date (seconds since UNIX epoch) - if birthdate, add SECONDS_BETWEEN_1900_AND_1970 to get the correct date
 * @param maxDateTimestamp - The maximum date (seconds since UNIX epoch) - if birthdate, add SECONDS_BETWEEN_1900_AND_1970 to get the correct date
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
    proofType === ProofType.BIRTHDATE && minDateTimestamp !== 0
      ? BigInt(minDateTimestamp) + BigInt(SECONDS_BETWEEN_1900_AND_1970)
      : BigInt(minDateTimestamp),
    proofType === ProofType.BIRTHDATE && maxDateTimestamp !== 0
      ? BigInt(maxDateTimestamp) + BigInt(SECONDS_BETWEEN_1900_AND_1970)
      : BigInt(maxDateTimestamp),
  ])
  return birthdateParameterCommitment
}

/**
 * Get the EVM parameter commitment for the date proof (birthdate and expiry date alike).
 * @param proofType - The proof type.
 * @param timestamp - The current timestamp (seconds since UNIX epoch)
 * @param minDateTimestamp - The minimum date (seconds since UNIX epoch) - if birthdate, add SECONDS_BETWEEN_1900_AND_1970 to get the correct date
 * @param maxDateTimestamp - The maximum date (seconds since UNIX epoch) - if birthdate, add SECONDS_BETWEEN_1900_AND_1970 to get the correct date
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
      ...numberToBytesBE(currentDateTimestamp, 8),
      ...numberToBytesBE(
        proofType === ProofType.BIRTHDATE && minDateTimestamp !== 0
          ? minDateTimestamp + SECONDS_BETWEEN_1900_AND_1970
          : minDateTimestamp,
        8,
      ),
      ...numberToBytesBE(
        proofType === ProofType.BIRTHDATE && maxDateTimestamp !== 0
          ? maxDateTimestamp + SECONDS_BETWEEN_1900_AND_1970
          : maxDateTimestamp,
        8,
      ),
    ]),
  )
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
