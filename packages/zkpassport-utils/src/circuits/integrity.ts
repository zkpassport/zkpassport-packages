import { ProofData } from ".."

export function getCommitmentInFromIntegrityProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 2])
}

export function getCommitmentOutFromIntegrityProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 1])
}

/**
 * Get the number of public inputs for the integrity proof.
 * @returns The number of public inputs.
 */
export function getIntegrityProofPublicInputCount(): number {
  return 2
}
