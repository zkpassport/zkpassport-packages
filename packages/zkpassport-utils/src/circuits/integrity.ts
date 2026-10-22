import { ProofData } from ".."

// The integrity proof's public inputs are comm_in, comm_out and, from 0.22.0, the credential
// scheme appended after them
export function getCommitmentInFromIntegrityProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export function getCommitmentOutFromIntegrityProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[1])
}

/**
 * Get the number of public inputs for the integrity proof.
 * @returns The number of public inputs.
 */
export function getIntegrityProofPublicInputCount(): number {
  return 2
}
