import { AgeCommittedInputs } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

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
 * @param currentDate - The current date (YYYYMMDD)
 * @param minAge - The minimum age.
 * @param maxAge - The maximum age.
 * @returns The parameter commitment.
 */
export async function getAgeParameterCommitment(
  currentDate: string,
  minAge: number,
  maxAge: number,
): Promise<bigint> {
  const ageParameterCommitment = await poseidon2HashAsync([
    ...Array.from(new TextEncoder().encode(currentDate)).map((x) => BigInt(x)),
    BigInt(minAge),
    BigInt(maxAge),
  ])
  return ageParameterCommitment
}
