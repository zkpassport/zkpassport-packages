/**
 * Note: this is a TS mirror of `noir/core/src/constants.nr`. That is the source of truth.
 */

/** Fields in the outer circuit's UltraHonk verification key. */
export const VK_FIELDS = 115
/** Fields in the outer ZK UltraHonk proof. */
export const PROOF_FIELDS = 458

/** Capsule slot the library loads the proof blob from (per-verifier address space). */
export const PROOF_CAPSULE_SLOT = 1n
/** Capsule slot for the disclose preimage (mask ‖ disclosed bytes). */
export const DISCLOSE_CAPSULE_SLOT = 2n
/** Capsule slot for the sanctions exclusion payload. */
export const SANCTIONS_CAPSULE_SLOT = 3n

/** The canonical 90-byte disclose payload length (TD1 exactly; TD3 zero-padded). */
export const MRZ_LENGTH = 90

/** Public-input count for `outer_count_K` is K + 5; param commitments are K - 3. */
export const outerPublicInputCount = (k: number): number => k + 5
/** Total field count of the proof-capsule blob for `outer_count_K`. */
export const outerCapsuleLength = (k: number): number =>
  VK_FIELDS + PROOF_FIELDS + outerPublicInputCount(k)
