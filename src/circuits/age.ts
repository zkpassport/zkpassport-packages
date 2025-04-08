import { convertDateBytesToDate, getDateBytes, ProofData } from "."
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

export function getMinAgeFromProof(proofData: ProofData): number {
  return Number(BigInt(proofData.publicInputs[9]))
}

export function getMaxAgeFromProof(proofData: ProofData): number {
  return Number(BigInt(proofData.publicInputs[10]))
}

export function getCurrentDateFromAgeProof(proofData: ProofData): Date {
  const dateBytes = proofData.publicInputs
    .slice(1, 9)
    .map((x) => Number(x) - 48)
    .map((x) => x.toString())
  const date = convertDateBytesToDate(dateBytes.join(""))
  return date
}

/**
 * Get the number of public inputs for the age proof.
 * @returns The number of public inputs.
 */
export function getAgeProofPublicInputCount(): number {
  return 14
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
