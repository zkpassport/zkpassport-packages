/**
 * Note: these come from `@zkpassport/utils`, a TS mirror of `noir/core/src/constants.nr`. That is
 * the source of truth.
 */
import {
  AZTEC_DISCLOSE_CAPSULE_SLOT,
  AZTEC_DISCLOSE_LENGTH,
  AZTEC_OUTER_PROOF_FIELDS,
  AZTEC_OUTER_VK_FIELDS,
  AZTEC_PROOF_CAPSULE_SLOT,
  AZTEC_SANCTIONS_CAPSULE_SLOT,
  AZTEC_SUPPORTED_CIRCUIT_VERSION,
  getAztecOuterPublicInputCount,
} from "@zkpassport/utils"

/** Fields in the outer circuit's UltraHonk verification key. */
export const VK_FIELDS = AZTEC_OUTER_VK_FIELDS
/** Fields in the outer ZK UltraHonk proof. */
export const PROOF_FIELDS = AZTEC_OUTER_PROOF_FIELDS

/** Capsule slot the library loads the proof blob from (per-verifier address space). */
export const PROOF_CAPSULE_SLOT = BigInt(AZTEC_PROOF_CAPSULE_SLOT)
/** Capsule slot for the disclose preimage (mask ‖ disclosed bytes). */
export const DISCLOSE_CAPSULE_SLOT = BigInt(AZTEC_DISCLOSE_CAPSULE_SLOT)
/** Capsule slot for the sanctions exclusion payload. */
export const SANCTIONS_CAPSULE_SLOT = BigInt(AZTEC_SANCTIONS_CAPSULE_SLOT)

/** The canonical 90-byte disclose payload length (TD1 exactly; TD3 zero-padded). */
export const MRZ_LENGTH = AZTEC_DISCLOSE_LENGTH

/** The circuits releases the library parses: 0.23.x. */
export const SUPPORTED_CIRCUIT_VERSION = AZTEC_SUPPORTED_CIRCUIT_VERSION

/**
 * Public-input count for a circuits 0.23.x `outer_count_K` proof is K + 6, ending in the
 * verification method; param commitments are K - 3.
 */
export const outerPublicInputCount = getAztecOuterPublicInputCount
/**
 * Total field count of the proof-capsule blob for `outer_count_K`:
 * vk ‖ proof ‖ public inputs ‖ circuit version.
 */
export const outerCapsuleLength = (k: number): number =>
  VK_FIELDS + PROOF_FIELDS + outerPublicInputCount(k) + 1
