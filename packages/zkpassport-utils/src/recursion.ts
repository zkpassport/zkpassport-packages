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
// circuit version 0.23.0 the credential scheme
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

  const proofData = getProofData(
    subproof.proof as string,
    getNumberOfPublicInputs(circuit.name, subproof.version),
  )
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

/** What every outer circuit takes from the disclosure proofs, whatever its base proofs */
function getDisclosureOuterInputs(disclosureProofs: OuterCircuitProof[]) {
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
  return {
    current_date: Number(BigInt(sourceProof.publicInputs[1])),
    service_scope: sourceProof.publicInputs[2],
    service_subscope: sourceProof.publicInputs[3],
    param_commitments: disclosureProofs.map((proof) => proof.publicInputs[4]),
    scoped_nullifier: (nullifierProof ?? sourceProof).publicInputs[6],
    nullifier_type: nullifierTypeProof.publicInputs[5],
    oprf_pk_hash: (nullifierProof ?? sourceProof).publicInputs[7],
    disclosure_proofs: disclosureProofs.map((proof) => ({
      vkey: proof.vkey,
      proof: proof.proof,
      // Keep the commitment in, scoped nullifier, nullifier type and oprf pk hash from the
      // disclosure proof's public inputs (in the order the outer circuit's DisclosureProof
      // struct expects them). The remaining values are passed directly to the outer circuit.
      // Disclosure circuit layout: [0] comm_in, [5] nullifier_type, [6] scoped_nullifier,
      // [7] oprf_pk_hash.
      public_inputs: [
        proof.publicInputs[0], // comm_in
        proof.publicInputs[6], // scoped_nullifier
        proof.publicInputs[5], // nullifier_type
        proof.publicInputs[7], // oprf_pk_hash
      ],
      key_hash: proof.keyHash,
      tree_hash_path: proof.treeHashPath,
      tree_index: proof.treeIndex,
    })),
  }
}

const asOuterSubproof = (proof: OuterCircuitProof, publicInputs = proof.publicInputs) => ({
  vkey: proof.vkey,
  proof: proof.proof,
  public_inputs: publicInputs,
  key_hash: proof.keyHash,
  tree_hash_path: proof.treeHashPath,
  tree_index: proof.treeIndex,
})

export function getOuterCircuitInputs(
  cscToDscProof: OuterCircuitProof,
  dscToIdDataProof: OuterCircuitProof,
  integrityCheckProof: OuterCircuitProof,
  disclosureProofs: OuterCircuitProof[],
  circuitRegistryRoot: string,
) {
  const disclosure = getDisclosureOuterInputs(disclosureProofs)
  return {
    certificate_registry_root: cscToDscProof.publicInputs[0],
    circuit_registry_root: circuitRegistryRoot,
    ...disclosure,
    // Output by the base proof; the outer checks it
    credential_scheme: integrityCheckProof.publicInputs[2],
    // Remove the certificate registry root from the public inputs
    csc_to_dsc_proof: asOuterSubproof(cscToDscProof, cscToDscProof.publicInputs.slice(1)),
    dsc_to_id_data_proof: asOuterSubproof(dscToIdDataProof),
    integrity_check_proof: asOuterSubproof(integrityCheckProof),
  }
}

/**
 * Get the name of the Tier 2 outer circuit, which aggregates an attested ID base proof (from
 * either platform: both have the same public inputs) and `disclosureProofCount` disclosure proofs
 * @param disclosureProofCount - The number of disclosure proofs, from 1 to 10
 * @param options.evm - Whether to get the outer circuit whose proofs are verified on EVM chains
 * @returns The outer circuit's name, e.g. outer_attested_id_count_2
 */
export function getAttestedOuterCircuitName(
  disclosureProofCount: number,
  { evm = false }: { evm?: boolean } = {},
): string {
  return getSingleBaseOuterCircuitName("attested_id", disclosureProofCount, evm)
}

export function getAadhaarOuterCircuitName(
  disclosureProofCount: number,
  { evm = false }: { evm?: boolean } = {},
): string {
  return getSingleBaseOuterCircuitName("aadhaar", disclosureProofCount, evm)
}

function getSingleBaseOuterCircuitName(kind: string, disclosureProofCount: number, evm: boolean) {
  if (
    !Number.isInteger(disclosureProofCount) ||
    disclosureProofCount < 1 ||
    disclosureProofCount > MAX_OUTER_DISCLOSURE_PROOFS
  ) {
    throw new Error(
      `No outer circuit for ${disclosureProofCount} disclosure proofs: expected 1 to ${MAX_OUTER_DISCLOSURE_PROOFS}`,
    )
  }
  return `outer_${evm ? "evm_" : ""}${kind}_count_${disclosureProofCount + 1}`
}

/**
 * The inputs of a Tier 2 outer circuit. The attested ID proof's parameter commitment comes
 * first, then the disclosure proofs'; a verifier must check that first one is a genuine device
 * attestation, which the circuit cannot.
 * @param attestedIdProof - The attested ID base proof
 * @param disclosureProofs - The disclosure proofs built on its commitment
 * @param circuitRegistryRoot - The root of the circuit registry the subproofs' vkeys are in
 * @param certificateRegistryRoot - A valid certificate registry root: a camera-read ID uses no
 * certificate, but the verifier checks this public input as for a chip ID
 */
export function getAttestedOuterCircuitInputs(
  attestedIdProof: OuterCircuitProof,
  disclosureProofs: OuterCircuitProof[],
  circuitRegistryRoot: string,
  certificateRegistryRoot: string,
) {
  const disclosure = getDisclosureOuterInputs(disclosureProofs)
  const attested = attestedIdProof.publicInputs
  return {
    certificate_registry_root: certificateRegistryRoot,
    circuit_registry_root: circuitRegistryRoot,
    ...disclosure,
    // The attested ID proof's outputs end with param_commitment and credential_scheme
    param_commitments: [attested[attested.length - 2], ...disclosure.param_commitments],
    credential_scheme: attested[attested.length - 1],
    attested_id_proof: asOuterSubproof(attestedIdProof),
  }
}

export function getAadhaarOuterCircuitInputs(
  aadhaarIdProof: OuterCircuitProof,
  disclosureProofs: OuterCircuitProof[],
  circuitRegistryRoot: string,
) {
  const [certificateRegistryRoot, , credentialScheme] = aadhaarIdProof.publicInputs
  return {
    certificate_registry_root: certificateRegistryRoot,
    circuit_registry_root: circuitRegistryRoot,
    ...getDisclosureOuterInputs(disclosureProofs),
    credential_scheme: credentialScheme,
    aadhaar_id_proof: asOuterSubproof(aadhaarIdProof),
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
  // since circuit version 0.23.0 the credential scheme.
  return proofData.publicInputs
    .slice(5, proofData.publicInputs.length - trailingCount(circuitVersion))
    .map(BigInt)
}
