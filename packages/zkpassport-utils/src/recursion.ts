import { NullifierType, ProofData } from "."

export type OuterCircuitProof = {
  // The proof as field elements
  proof: string[]
  // The public inputs as field elements
  publicInputs: string[]
  // The vkey as field elements
  vkey: string[]
  // The key hash as a field element
  keyHash: string
  // The tree hash path as field elements
  treeHashPath: string[]
  // The tree index as a field element
  treeIndex: string
}

export function getOuterCircuitInputs(
  cscToDscProof: OuterCircuitProof,
  dscToIdDataProof: OuterCircuitProof,
  integrityCheckProof: OuterCircuitProof,
  disclosureProofs: OuterCircuitProof[],
  circuitRegistryRoot: string,
) {
  const certificateRegistryRoot = cscToDscProof.publicInputs[0]
  const currentDateTimestamp = Number(BigInt(integrityCheckProof.publicInputs[0]))
  const scope = disclosureProofs[0].publicInputs[1]
  const subscope = disclosureProofs[0].publicInputs[2]
  const nullifierType = disclosureProofs[0].publicInputs[4]
  const nullifier = disclosureProofs[0].publicInputs[5]
  const paramCommitments = disclosureProofs.map((proof) => proof.publicInputs[3])

  return {
    certificate_registry_root: certificateRegistryRoot,
    circuit_registry_root: circuitRegistryRoot,
    current_date: currentDateTimestamp,
    service_scope: scope,
    service_subscope: subscope,
    param_commitments: paramCommitments,
    scoped_nullifier: nullifier,
    nullifier_type: nullifierType,
    csc_to_dsc_proof: {
      vkey: cscToDscProof.vkey,
      proof: cscToDscProof.proof,
      // Remove the certificate registry root from the public inputs
      public_inputs: cscToDscProof.publicInputs.slice(1),
      key_hash: cscToDscProof.keyHash,
      tree_hash_path: cscToDscProof.treeHashPath,
      tree_index: cscToDscProof.treeIndex,
    },
    dsc_to_id_data_proof: {
      vkey: dscToIdDataProof.vkey,
      proof: dscToIdDataProof.proof,
      public_inputs: dscToIdDataProof.publicInputs,
      key_hash: dscToIdDataProof.keyHash,
      tree_hash_path: dscToIdDataProof.treeHashPath,
      tree_index: dscToIdDataProof.treeIndex,
    },
    integrity_check_proof: {
      vkey: integrityCheckProof.vkey,
      proof: integrityCheckProof.proof,
      // Only keep the commitments from the public inputs
      public_inputs: integrityCheckProof.publicInputs.slice(-2),
      key_hash: integrityCheckProof.keyHash,
      tree_hash_path: integrityCheckProof.treeHashPath,
      tree_index: integrityCheckProof.treeIndex,
    },
    disclosure_proofs: disclosureProofs.map((proof) => ({
      vkey: proof.vkey,
      proof: proof.proof,
      // Only keep the commitment in from the public inputs
      // all the rest are passed directly as public inputs to the outer circuit
      public_inputs: proof.publicInputs.slice(0, 1),
      key_hash: proof.keyHash,
      tree_hash_path: proof.treeHashPath,
      tree_index: proof.treeIndex,
    })),
  }
}

export function getCertificateRegistryRootFromOuterProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export function getCircuitRegistryRootFromOuterProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[1])
}

export function getCurrentDateFromOuterProof(proofData: ProofData): Date {
  return new Date(Number(BigInt(proofData.publicInputs[2])) * 1000)
}

/**
 * Get the service scope from the outer circuit proof.
 * @param proofData - The proof data.
 * @returns The service scope.
 */
export function getScopeFromOuterProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[3])
}

/**
 * Get the service subscope from the outer circuit proof.
 * @param proofData - The proof data.
 * @returns The service subscope.
 */
export function getSubscopeFromOuterProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[4])
}

export function getNullifierTypeFromOuterProof(proofData: ProofData): NullifierType {
  const nullifierType = BigInt(proofData.publicInputs[proofData.publicInputs.length - 2])
  if (nullifierType === 0n) {
    return NullifierType.NON_SALTED
  } else if (nullifierType === 1n) {
    return NullifierType.SALTED
  } else if (nullifierType === 2n) {
    return NullifierType.NON_SALTED_MOCK
  } else if (nullifierType === 3n) {
    return NullifierType.SALTED_MOCK
  }
  throw new Error("Invalid nullifier type")
}

/**
 * Get the scoped nullifier from the outer circuit proof.
 * @param proofData - The proof data.
 * @returns The scoped nullifier.
 */
export function getNullifierFromOuterProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 1])
}

/**
 * Get the param commitments from the outer circuit proof.
 * @param proofData - The proof data.
 * @returns The param commitments.
 */
export function getParamCommitmentsFromOuterProof(proofData: ProofData): bigint[] {
  return proofData.publicInputs.slice(5, proofData.publicInputs.length - 1).map(BigInt)
}
