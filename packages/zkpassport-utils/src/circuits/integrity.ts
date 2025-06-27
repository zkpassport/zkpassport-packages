import { convertDateBytesToDate, ProofData } from ".."

export function getCommitmentInFromIntegrityProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 2])
}

export function getCommitmentOutFromIntegrityProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 1])
}

export function getCurrentDateFromIntegrityProof(proofData: ProofData): Date {
  const dateBytes = proofData.publicInputs
    .slice(0, 8)
    .map((x) => Number(x) - 48)
    .map((x) => x.toString())
  const date = convertDateBytesToDate(dateBytes.join(""))
  return date
}

/**
 * Get the number of public inputs for the integrity proof.
 * @returns The number of public inputs.
 */
export function getIntegrityProofPublicInputCount(): number {
  return 10
}
