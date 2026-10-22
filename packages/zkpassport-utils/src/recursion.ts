import {
  CircuitManifest,
  getCircuitMerkleProof,
  getNumberOfPublicInputs,
  getProofData,
  NullifierType,
  PackagedCircuit,
  ProofData,
  ProofResult,
  ultraVkToFields,
} from "."
import { hasCredentialScheme } from "./circuits/credential-scheme"

const BASE_SUBPROOF_COUNT = 3
const MAX_OUTER_DISCLOSURE_PROOFS = 10

// Trailing outer public inputs: nullifier_type, scoped_nullifier, oprf_pk_hash, and since
// circuit version 0.22.0 the credential scheme
const trailingCount = (circuitVersion?: string) => (hasCredentialScheme(circuitVersion) ? 4 : 3)

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

/**
 * Get the name of the outer circuit that aggregates the three base subproofs and
 * `disclosureProofCount` disclosure proofs
 * @param disclosureProofCount - The number of disclosure proofs, from 1 to 10
 * @param options.evm - Whether to get the outer circuit whose proofs are verified on EVM chains
 * @returns The outer circuit's name, e.g. outer_count_5 or outer_evm_count_5
 */
export function getOuterCircuitName(
  disclosureProofCount: number,
  { evm = false }: { evm?: boolean } = {},
): string {
  if (
    !Number.isInteger(disclosureProofCount) ||
    disclosureProofCount < 1 ||
    disclosureProofCount > MAX_OUTER_DISCLOSURE_PROOFS
  ) {
    throw new Error(
      `No outer circuit for ${disclosureProofCount} disclosure proofs: expected 1 to ${MAX_OUTER_DISCLOSURE_PROOFS}`,
    )
  }

  return `outer_${evm ? "evm_" : ""}count_${BASE_SUBPROOF_COUNT + disclosureProofCount}`
}

/**
 * Get a subproof in the form the outer circuit takes it: its proof and verification key as fields,
 * and the path of its vkey hash in the circuit registry tree of `circuitManifest`
 * @param subproof - The subproof, its public inputs followed by its proof, as hex
 * @param circuit - The packaged circuit the subproof was generated with, which must have the
 * subproof's vkey hash
 * @param circuitManifest - The manifest of the circuits version that includes `circuit`
 * @param computeMerkleProofFn - The function computing the path, defaulting to computeMerkleProof
 * @returns The subproof as the outer circuit takes it
 */
export async function getOuterCircuitProof(
  subproof: ProofResult,
  circuit: Pick<PackagedCircuit, "name" | "vkey" | "vkey_hash">,
  circuitManifest: CircuitManifest,
  computeMerkleProofFn?: Parameters<typeof getCircuitMerkleProof>[2],
): Promise<OuterCircuitProof> {
  if (subproof.vkeyHash !== undefined && BigInt(subproof.vkeyHash) !== BigInt(circuit.vkey_hash)) {
    throw new Error(
      `The ${circuit.name} subproof was generated with vkey hash ${subproof.vkeyHash}, not ${circuit.vkey_hash}`,
    )
  }

  const proofData = getProofData(subproof.proof as string, getNumberOfPublicInputs(circuit.name))
  const { index, path } = await getCircuitMerkleProof(
    circuit.vkey_hash,
    circuitManifest,
    computeMerkleProofFn,
  )

  return {
    proof: proofData.proof.map((field) => `0x${field}`),
    publicInputs: proofData.publicInputs,
    vkey: ultraVkToFields(Buffer.from(circuit.vkey, "base64")),
    keyHash: circuit.vkey_hash,
    treeHashPath: path,
    treeIndex: `0x${index.toString(16)}`,
  }
}

function getDisclosureProofWithNonZeroNullifier(
  disclosureProofs: OuterCircuitProof[],
): OuterCircuitProof | undefined {
  return disclosureProofs.find((proof) => BigInt(proof.publicInputs[6]) !== 0n)
}

export function getOuterCircuitInputs(
  cscToDscProof: OuterCircuitProof,
  dscToIdDataProof: OuterCircuitProof,
  integrityCheckProof: OuterCircuitProof,
  disclosureProofs: OuterCircuitProof[],
  circuitRegistryRoot: string,
) {
  if (disclosureProofs.length === 0) {
    throw new Error("At least one disclosure proof is required")
  }
  // All subproofs carry the same date, scope and subscope (the outer circuit
  // enforces this), so the first proof can provide them
  const sourceProof = disclosureProofs[0]
  // The nullifier may sit on a different subproof (e.g. facematch proofs carry none)
  const nullifierProof = getDisclosureProofWithNonZeroNullifier(disclosureProofs)
  // A mock type must win at the top level so mock proofs stay detectable
  const nullifierTypeProof =
    nullifierProof ??
    disclosureProofs.find(
      (proof) => BigInt(proof.publicInputs[5]) !== BigInt(NullifierType.NONE),
    ) ??
    sourceProof
  const certificateRegistryRoot = cscToDscProof.publicInputs[0]
  const currentDateTimestamp = Number(BigInt(sourceProof.publicInputs[1]))
  const scope = sourceProof.publicInputs[2]
  const subscope = sourceProof.publicInputs[3]
  const nullifierType = nullifierTypeProof.publicInputs[5]
  const nullifier = (nullifierProof ?? sourceProof).publicInputs[6]
  const oprfPkHash = (nullifierProof ?? sourceProof).publicInputs[7]
  const paramCommitments = disclosureProofs.map((proof) => proof.publicInputs[4])
  // Output by the base proof and carried by every disclosure proof; the outer checks both
  const credentialScheme = integrityCheckProof.publicInputs[2]

  return {
    certificate_registry_root: certificateRegistryRoot,
    circuit_registry_root: circuitRegistryRoot,
    current_date: currentDateTimestamp,
    service_scope: scope,
    service_subscope: subscope,
    param_commitments: paramCommitments,
    scoped_nullifier: nullifier,
    nullifier_type: nullifierType,
    oprf_pk_hash: oprfPkHash,
    credential_scheme: credentialScheme,
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
      public_inputs: integrityCheckProof.publicInputs,
      key_hash: integrityCheckProof.keyHash,
      tree_hash_path: integrityCheckProof.treeHashPath,
      tree_index: integrityCheckProof.treeIndex,
    },
    disclosure_proofs: disclosureProofs.map((proof) => ({
      vkey: proof.vkey,
      proof: proof.proof,
      // Keep the commitment in, scoped nullifier, nullifier type and oprf pk hash from the
      // disclosure proof's public inputs (in the order the outer circuit's DisclosureProof
      // struct expects them). The remaining values are passed directly to the outer circuit.
      // Disclosure circuit layout: [0] comm_in, [5] nullifier_type, [6] scoped_nullifier,
      // [7] oprf_pk_hash, [8] credential_scheme.
      public_inputs: [
        proof.publicInputs[0], // comm_in
        proof.publicInputs[6], // scoped_nullifier
        proof.publicInputs[5], // nullifier_type
        proof.publicInputs[7], // oprf_pk_hash
        proof.publicInputs[8], // credential_scheme
      ],
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

export function getNullifierTypeFromOuterProof(
  proofData: ProofData,
  circuitVersion?: string,
): NullifierType {
  const nullifierType = BigInt(
    proofData.publicInputs[proofData.publicInputs.length - trailingCount(circuitVersion)],
  )
  if (nullifierType === 0n) {
    return NullifierType.NON_SALTED
  } else if (nullifierType === 1n) {
    return NullifierType.SALTED
  } else if (nullifierType === 2n) {
    return NullifierType.NON_SALTED_MOCK
  } else if (nullifierType === 3n) {
    return NullifierType.SALTED_MOCK
  } else if (nullifierType === 4n) {
    return NullifierType.NONE
  }
  throw new Error("Invalid nullifier type")
}

/**
 * Get the scoped nullifier from the outer circuit proof.
 * @param proofData - The proof data.
 * @returns The scoped nullifier.
 */
export function getNullifierFromOuterProof(proofData: ProofData, circuitVersion?: string): bigint {
  return BigInt(
    proofData.publicInputs[proofData.publicInputs.length - trailingCount(circuitVersion) + 1],
  )
}

export function getOprfPkHashFromOuterProof(proofData: ProofData, circuitVersion?: string): bigint {
  return BigInt(
    proofData.publicInputs[proofData.publicInputs.length - trailingCount(circuitVersion) + 2],
  )
}

/**
 * Get the param commitments from the outer circuit proof.
 * @param proofData - The proof data.
 * @returns The param commitments.
 */
export function getParamCommitmentsFromOuterProof(
  proofData: ProofData,
  circuitVersion?: string,
): bigint[] {
  // Trailing public inputs (in order): nullifier_type, scoped_nullifier, oprf_pk_hash, and
  // since circuit version 0.22.0 the credential scheme.
  return proofData.publicInputs
    .slice(5, proofData.publicInputs.length - trailingCount(circuitVersion))
    .map(BigInt)
}
