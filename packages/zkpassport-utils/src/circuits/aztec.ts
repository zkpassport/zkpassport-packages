import { circuitVersionToBytes32 } from "../registry"
import type { FacematchCommittedInputs } from "../types"
import { outerTrailingInputs } from "./public-input-layout"

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

/** The circuits releases ZKPassport's Aztec library verifies: 0.23.x */
export const AZTEC_SUPPORTED_CIRCUIT_VERSION = /^0\.23\.\d+$/

/** Whether ZKPassport's Aztec library verifies proofs of the circuits release `version` */
export function isAztecSupportedCircuitVersion(version: string): boolean {
  return AZTEC_SUPPORTED_CIRCUIT_VERSION.test(version)
}

/**
 * Public inputs of a circuits 0.23.x `outer_count_<subproofs>` proof: 5, then a param commitment
 * per subproof after the first 3, then the trailing inputs, ending in the verification method
 */
export function getAztecOuterPublicInputCount(subproofs: number): number {
  return 5 + (subproofs - 3) + outerTrailingInputs(true).length
}

/**
 * The proof capsule of a circuits 0.23.x `outer_count_<subproofs>` proof:
 * vk ‖ proof ‖ public inputs ‖ circuit version, the version packed as the registry keys vks by
 * it. The fields can be bare hex, as getProofData returns a proof's fields.
 */
export function getAztecProofCapsule(
  parts: { vk: string[]; proof: string[]; publicInputs: string[]; version: string },
  subproofs: number,
): string[] {
  if (!isAztecSupportedCircuitVersion(parts.version)) {
    throw new Error(
      `Circuits ${parts.version} proofs do not verify on Aztec: ZKPassport's Aztec library ` +
        `verifies circuits 0.23.x`,
    )
  }
  const publicInputCount = getAztecOuterPublicInputCount(subproofs)
  if (
    parts.vk.length !== AZTEC_OUTER_VK_FIELDS ||
    parts.proof.length !== AZTEC_OUTER_PROOF_FIELDS ||
    parts.publicInputs.length !== publicInputCount
  ) {
    throw new Error(
      `Outer proof shape mismatch: vk ${parts.vk.length}/${AZTEC_OUTER_VK_FIELDS}, ` +
        `proof ${parts.proof.length}/${AZTEC_OUTER_PROOF_FIELDS}, public inputs ` +
        `${parts.publicInputs.length}/${publicInputCount}, expected an outer_count_${subproofs} ` +
        `proof of circuits 0.23.x`,
    )
  }
  return [
    ...[...parts.vk, ...parts.proof, ...parts.publicInputs].map(hexField),
    circuitVersionToBytes32(parts.version),
  ]
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
 * The face match capsule: the face match's parameters in the order its proof commits them, one
 * field each: the root key leaf, the environment (1 for production, 0 for development), the app id
 * hash, the integrity public key hash, the mode (1 for regular, 2 for strict) and the revocation
 * root, 0 for a face match that commits none, as an iOS one. The hashes are read with `BigInt`, as
 * the SDK reads them to check the face match's commitment.
 */
export function getAztecFacematchCapsule(facematch: FacematchCommittedInputs): string[] {
  const environment = { development: 0n, production: 1n }[facematch.environment]
  const mode = { regular: 1n, strict: 2n }[facematch.mode]
  if (environment === undefined || mode === undefined) {
    throw new Error(
      `Unknown face match environment ${facematch.environment} or mode ${facematch.mode}`,
    )
  }
  return [
    BigInt(facematch.rootKeyLeaf),
    environment,
    BigInt(facematch.appIdHash),
    BigInt(facematch.integrityPubkeyHash),
    mode,
    BigInt(facematch.revocationRoot ?? 0),
  ].map(hexField)
}

// A field as 0x-prefixed 32-byte hex. A string is read as hex, with or without 0x, never as decimal.
function hexField(value: string | bigint): string {
  const hex = typeof value === "bigint" ? value.toString(16) : value.replace(/^0x/i, "")
  if (!/^[0-9a-f]{1,64}$/i.test(hex)) {
    throw new Error(`Not a 32-byte hex field: ${value}`)
  }
  return `0x${hex.toLowerCase().padStart(64, "0")}`
}
