import { ProofData } from ".."

export function getCommitmentInFromIDDataProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export function getCommitmentOutFromIDDataProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[1])
}

/**
 * Get the number of public inputs for the ID data proof.
 * @returns The number of public inputs.
 */
export function getIDDataProofPublicInputCount(): number {
  return 2
}
