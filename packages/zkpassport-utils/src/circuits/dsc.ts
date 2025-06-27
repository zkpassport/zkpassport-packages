import { ProofData } from ".."

export function getMerkleRootFromDSCProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export function getCommitmentFromDSCProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[1])
}

/**
 * Get the number of public inputs for the DSC proof.
 * @returns The number of public inputs.
 */
export function getDSCProofPublicInputCount(): number {
  return 2
}
