import { sha256 } from "@noble/hashes/sha256"
import { DateCommittedInputs } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { packBeBytesIntoField } from "../utils"
import { ProofType } from "."

/**
 * Convert a date string to a Date object
 * @param strDate - The date string to convert (YYYYMMDD)
 * @returns The Date object
 */
export function convertDateBytesToDate(strDate: string): Date {
  const year = Number(strDate.slice(0, 4))
  const month = Number(strDate.slice(4, 6))
  const day = Number(strDate.slice(6, 8))
  return new Date(year, month - 1, day)
}

export function getMinDateFromCommittedInputs(committedInputs: DateCommittedInputs): Date {
  return convertDateBytesToDate(committedInputs.minDate)
}

export function getMaxDateFromCommittedInputs(committedInputs: DateCommittedInputs): Date {
  return convertDateBytesToDate(committedInputs.maxDate)
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
 * @param currentDate - The current date (YYYYMMDD)
 * @param minDate - The minimum date (YYYYMMDD)
 * @param maxDate - The maximum date (YYYYMMDD)
 * @returns The parameter commitment.
 */
export async function getDateParameterCommitment(
  proofType: ProofType,
  currentDate: string,
  minDate: string = "11111111",
  maxDate: string = "11111111",
): Promise<bigint> {
  const birthdateParameterCommitment = await poseidon2HashAsync([
    BigInt(proofType),
    ...Array.from(new TextEncoder().encode(currentDate)).map((x) => BigInt(x)),
    ...Array.from(new TextEncoder().encode(minDate)).map((x) => BigInt(x)),
    ...Array.from(new TextEncoder().encode(maxDate)).map((x) => BigInt(x)),
  ])
  return birthdateParameterCommitment
}

/**
 * Get the EVM parameter commitment for the date proof (birthdate and expiry date alike).
 * @param proofType - The proof type.
 * @param currentDate - The current date (YYYYMMDD)
 * @param minDate - The minimum date (YYYYMMDD)
 * @param maxDate - The maximum date (YYYYMMDD)
 * @returns The parameter commitment.
 */
export async function getDateEVMParameterCommitment(
  proofType: ProofType,
  currentDate: string,
  minDate: string = "11111111",
  maxDate: string = "11111111",
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([
      proofType,
      ...Array.from(new TextEncoder().encode(currentDate)).map((x) => Number(x)),
      ...Array.from(new TextEncoder().encode(minDate)).map((x) => Number(x)),
      ...Array.from(new TextEncoder().encode(maxDate)).map((x) => Number(x)),
    ]),
  )
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
