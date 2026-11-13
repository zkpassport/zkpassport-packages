import type { FacematchCommittedInputs } from "../types"

/** A capsule for an Aztec contract: the slot the contract reads it from and its fields as hex */
export type AztecCapsule = {
  slot: number
  fields: string[]
}

/** The capsules an Aztec contract's `verify_zkpassport_proof` reads for a proof */
export type AztecVerifierParameters = {
  capsules: AztecCapsule[]
}

/** Fields in the verification key of an outer circuit */
export const AZTEC_OUTER_VK_FIELDS = 115
/** Fields in an outer proof, without its public inputs */
export const AZTEC_OUTER_PROOF_FIELDS = 458
/** Bytes in a disclose subproof's mask, and in its disclosed bytes */
export const AZTEC_DISCLOSE_LENGTH = 90

/** The capsule slots ZKPassport's Aztec library reads, in the verifying contract's slots */
export const AZTEC_PROOF_CAPSULE_SLOT = 1
export const AZTEC_DISCLOSE_CAPSULE_SLOT = 2
export const AZTEC_SANCTIONS_CAPSULE_SLOT = 3
export const AZTEC_FACE_MATCH_CAPSULE_SLOT = 4

/** Public inputs of `outer_count_<subproofs>`, the outer circuit of `subproofs` subproofs */
export function getAztecOuterPublicInputCount(subproofs: number): number {
  return subproofs + 5
}

/**
 * The proof capsule of an `outer_count_<subproofs>` proof: vk ‖ proof ‖ public inputs.
 * The fields can be bare hex, as getProofData returns a proof's fields.
 */
export function getAztecProofCapsule(
  parts: { vk: string[]; proof: string[]; publicInputs: string[] },
  subproofs: number,
): string[] {
  const publicInputCount = getAztecOuterPublicInputCount(subproofs)
  if (
    parts.vk.length !== AZTEC_OUTER_VK_FIELDS ||
    parts.proof.length !== AZTEC_OUTER_PROOF_FIELDS ||
    parts.publicInputs.length !== publicInputCount
  ) {
    throw new Error(
      `Outer proof shape mismatch: vk ${parts.vk.length}/${AZTEC_OUTER_VK_FIELDS}, ` +
        `proof ${parts.proof.length}/${AZTEC_OUTER_PROOF_FIELDS}, public inputs ` +
        `${parts.publicInputs.length}/${publicInputCount}, expected outer_count_${subproofs}`,
    )
  }
  return [...parts.vk, ...parts.proof, ...parts.publicInputs].map(hexField)
}

/** The disclose capsule: the disclose subproof's mask ‖ disclosed bytes, one field each */
export function getAztecDiscloseCapsule(
  discloseMask: number[],
  disclosedBytes: number[],
): string[] {
  if (
    discloseMask.length !== AZTEC_DISCLOSE_LENGTH ||
    disclosedBytes.length !== AZTEC_DISCLOSE_LENGTH
  ) {
    throw new Error(
      `Disclose payload shape mismatch: mask ${discloseMask.length}/${AZTEC_DISCLOSE_LENGTH}, ` +
        `bytes ${disclosedBytes.length}/${AZTEC_DISCLOSE_LENGTH}`,
    )
  }
  return [...discloseMask, ...disclosedBytes].map((value) => hexField(BigInt(value)))
}

/** The sanctions capsule: the sanctions root the proof was made against */
export function getAztecSanctionsCapsule(rootHash: string): string[] {
  return [hexField(rootHash)]
}

/**
 * The face match capsule: the values a facematch subproof commits to, in the circuits' encoding.
 * Root key leaf, environment (1 for production), app id hash, integrity key hash, and mode (2 for
 * strict).
 */
export function getAztecFacematchCapsule(inputs: FacematchCommittedInputs): string[] {
  return [
    hexField(inputs.rootKeyLeaf),
    hexField(inputs.environment === "production" ? 1n : 0n),
    hexField(inputs.appIdHash),
    hexField(inputs.integrityPubkeyHash),
    hexField(inputs.mode === "strict" ? 2n : 1n),
  ]
}

// A field as 0x-prefixed 32-byte hex. A string is read as hex, with or without 0x, never as decimal.
function hexField(value: string | bigint): string {
  const hex = typeof value === "bigint" ? value.toString(16) : value.replace(/^0x/i, "")
  if (!/^[0-9a-f]{1,64}$/i.test(hex)) {
    throw new Error(`Not a 32-byte hex field: ${value}`)
  }
  return `0x${hex.toLowerCase().padStart(64, "0")}`
}
