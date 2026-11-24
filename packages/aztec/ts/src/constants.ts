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

const SUPPORTED_CIRCUITS_MAJOR = 0
const SUPPORTED_CIRCUITS_MINOR = 23

/** The circuits releases the library parses: every patch of 0.23. */
export const SUPPORTED_CIRCUIT_VERSION = new RegExp(
  `^${SUPPORTED_CIRCUITS_MAJOR}\\.${SUPPORTED_CIRCUITS_MINOR}\\.\\d+$`,
)
/** `SUPPORTED_CIRCUIT_VERSION` for messages: "0.23.x". */
export const SUPPORTED_CIRCUIT_VERSION_LABEL = `${SUPPORTED_CIRCUITS_MAJOR}.${SUPPORTED_CIRCUITS_MINOR}.x`

/**
 * Public-input count for a circuits 0.23.x `outer_count_K` proof is K + 6, ending in the
 * verification method; param commitments are K - 3.
 */
export const outerPublicInputCount = (k: number): number => k + 6
/**
 * Total field count of the proof-capsule blob for `outer_count_K`:
 * vk ‖ proof ‖ public inputs ‖ circuit version.
 */
export const outerCapsuleLength = (k: number): number =>
  VK_FIELDS + PROOF_FIELDS + outerPublicInputCount(k) + 1
