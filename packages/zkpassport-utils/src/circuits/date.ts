import { sha256 } from "@noble/hashes/sha2"
import { DateCommittedInputs } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { packBeBytesIntoField, numberToBytesBE } from "../utils"
import { ProofType } from "."

export const SECONDS_BETWEEN_1900_AND_1970 = Math.floor(
  Math.abs(Date.UTC(1900, 0, 1, 0, 0, 0)) / 1000,
)

export function getMinDateFromCommittedInputs(committedInputs: DateCommittedInputs): Date {
  return new Date(committedInputs.minDateTimestamp * 1000)
}

export function getMaxDateFromCommittedInputs(committedInputs: DateCommittedInputs): Date {
  return new Date(committedInputs.maxDateTimestamp * 1000)
}

export function getBirthdateMinDateTimestamp(
  committedInputs: DateCommittedInputs,
  offset = SECONDS_BETWEEN_1900_AND_1970,
): Date {
  const timestamp = getMinDateFromCommittedInputs(committedInputs).getTime()
  if (timestamp === 0) {
    return new Date(0)
  }
  return new Date(getMinDateFromCommittedInputs(committedInputs).getTime() + offset * 1000)
}

export function getBirthdateMaxDateTimestamp(
  committedInputs: DateCommittedInputs,
  offset = SECONDS_BETWEEN_1900_AND_1970,
): Date {
  const timestamp = getMaxDateFromCommittedInputs(committedInputs).getTime()
  if (timestamp === 0) {
    return new Date(0)
  }
  return new Date(getMaxDateFromCommittedInputs(committedInputs).getTime() + offset * 1000)
}

/**
 * Get the parameter commitment for the date proof (birthdate and expiry date alike).
 * @param proofType - The proof type.
 * @param currentDateTimestamp - The current timestamp (seconds since UNIX epoch)
 * @param minDateTimestamp - The minimum date (seconds since UNIX epoch) - if birthdate, add SECONDS_BETWEEN_1900_AND_1970 to get the correct date
 * @param maxDateTimestamp - The maximum date (seconds since UNIX epoch) - if birthdate, add SECONDS_BETWEEN_1900_AND_1970 to get the correct date
 * @param birthdateOffset - The offset to add to the min and max date timestamps if the proof type is birthdate, defaults to SECONDS_BETWEEN_1900_AND_1970
 * @returns The parameter commitment.
 */
export async function getDateParameterCommitment(
  proofType: ProofType,
  currentDateTimestamp: number,
  minDateTimestamp: number,
  maxDateTimestamp: number,
  birthdateOffset = SECONDS_BETWEEN_1900_AND_1970,
): Promise<bigint> {
  const birthdateParameterCommitment = await poseidon2HashAsync([
    BigInt(proofType),
    BigInt(currentDateTimestamp),
    proofType === ProofType.BIRTHDATE && minDateTimestamp !== 0
      ? BigInt(minDateTimestamp) + BigInt(birthdateOffset)
      : BigInt(minDateTimestamp),
    proofType === ProofType.BIRTHDATE && maxDateTimestamp !== 0
      ? BigInt(maxDateTimestamp) + BigInt(birthdateOffset)
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
 * @param birthdateOffset - The offset to add to the min and max date timestamps if the proof type is birthdate, defaults to SECONDS_BETWEEN_1900_AND_1970
 * @returns The parameter commitment.
 */
export async function getDateEVMParameterCommitment(
  proofType: ProofType,
  currentDateTimestamp: number,
  minDateTimestamp: number,
  maxDateTimestamp: number,
  birthdateOffset = SECONDS_BETWEEN_1900_AND_1970,
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([
      proofType,
      ...numberToBytesBE(currentDateTimestamp, 8),
      ...numberToBytesBE(
        proofType === ProofType.BIRTHDATE && minDateTimestamp !== 0
          ? minDateTimestamp + birthdateOffset
          : minDateTimestamp,
        8,
      ),
      ...numberToBytesBE(
        proofType === ProofType.BIRTHDATE && maxDateTimestamp !== 0
          ? maxDateTimestamp + birthdateOffset
          : maxDateTimestamp,
        8,
      ),
    ]),
  )
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
