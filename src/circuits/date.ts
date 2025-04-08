import { DEFAULT_DATE_VALUE, getDateBytes, ProofData } from "."
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

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

export function getCurrentDateFromDateProof(proofData: ProofData): Date {
  const dateBytes = proofData.publicInputs
    .slice(1, 9)
    .map((x) => Number(x) - 48)
    .map((x) => x.toString())
  const date = convertDateBytesToDate(dateBytes.join(""))
  return date
}

export function getMinDateFromProof(proofData: ProofData): Date {
  const dateBytes = proofData.publicInputs
    .slice(9, 17)
    .map((x) => Number(x) - 48)
    .map((x) => x.toString())
  const date = convertDateBytesToDate(dateBytes.join(""))
  return date
}

export function getMaxDateFromProof(proofData: ProofData): Date {
  const dateBytes = proofData.publicInputs
    .slice(17, 25)
    .map((x) => Number(x) - 48)
    .map((x) => x.toString())
  const date = convertDateBytesToDate(dateBytes.join(""))
  return date
}

/**
 * Get the number of public inputs for the date proof.
 * @returns The number of public inputs.
 */
export function getDateProofPublicInputCount(): number {
  return 28
}

/**
 * Get the parameter commitment for the date proof (birthdate and expiry date alike).
 * @param currentDate - The current date (YYYYMMDD)
 * @param minDate - The minimum date (YYYYMMDD)
 * @param maxDate - The maximum date (YYYYMMDD)
 * @returns The parameter commitment.
 */
export async function getDateParameterCommitment(
  currentDate: string,
  minDate: string = "11111111",
  maxDate: string = "11111111",
): Promise<bigint> {
  const birthdateParameterCommitment = await poseidon2HashAsync([
    ...Array.from(new TextEncoder().encode(currentDate)).map((x) => BigInt(x)),
    ...Array.from(new TextEncoder().encode(minDate)).map((x) => BigInt(x)),
    ...Array.from(new TextEncoder().encode(maxDate)).map((x) => BigInt(x)),
  ])
  return birthdateParameterCommitment
}
