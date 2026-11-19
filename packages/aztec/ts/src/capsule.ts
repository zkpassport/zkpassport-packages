import { Fr } from "@aztec-labs/aztec.js/fields"
import { circuitVersionToBytes32 } from "@zkpassport/utils"

import {
  MRZ_LENGTH,
  outerPublicInputCount,
  PROOF_FIELDS,
  SUPPORTED_CIRCUIT_VERSION,
  VK_FIELDS,
} from "./constants.ts"

/**
 * The three field groups of an outer proof, as hex strings from the SDK/utils, and the circuits
 * release that made it (the SDK's `ProofResult.version`, e.g. "0.23.0").
 */
export interface OuterProofParts {
  vk: string[]
  proof: string[]
  publicInputs: string[]
  version: string
}

/**
 * Assemble the proof-capsule blob the library's `verify_zkpassport_proof` consumes:
 * `vk(115) ‖ proof(458) ‖ public_inputs(K + 6) ‖ circuit_version`, which can then be delivered on
 * `PROOF_CAPSULE_SLOT` of the verifier contract. The version is packed as the registry keys vks
 * by it, and the registry only accepts the proof's vk under the release that built it.
 *
 * Shape-checks first: the on-chain load of a wrong-shaped blob just returns
 * None ("missing zkpassport proof capsule"). `k` is the outer circuit's subproof count
 * (`outer_count_5` → 5, the shape current SDK queries produce). A release other than 0.23.x is
 * rejected, since the library would reject its proof.
 *
 * Parsing note: the SDK/utils emit field elements as BARE hex (no `0x`).
 * `Fr.fromString` would reject those — and silently misread an all-digit hex
 * string as decimal — so every element is parsed explicitly as hex.
 */
export function assembleProofCapsule(parts: OuterProofParts, k = 5): Fr[] {
  if (!SUPPORTED_CIRCUIT_VERSION.test(parts.version)) {
    throw new Error(
      `zkPassport circuits ${parts.version} proofs do not verify on Aztec: the library verifies ` +
        `circuits 0.23.x`,
    )
  }
  const wantPIs = outerPublicInputCount(k)
  if (
    parts.vk.length !== VK_FIELDS ||
    parts.proof.length !== PROOF_FIELDS ||
    parts.publicInputs.length !== wantPIs
  ) {
    throw new Error(
      `zkPassport outer-proof shape mismatch: vk ${parts.vk.length}/${VK_FIELDS}, ` +
        `proof ${parts.proof.length}/${PROOF_FIELDS}, public inputs ` +
        `${parts.publicInputs.length}/${wantPIs} — expected an outer_count_${k} proof of circuits ` +
        `0.23.x`,
    )
  }
  return [
    ...parts.vk,
    ...parts.proof,
    ...parts.publicInputs,
    circuitVersionToBytes32(parts.version),
  ].map((h) => Fr.fromHexString(h))
}

/**
 * Assemble the disclose preimage for `DISCLOSE_CAPSULE_SLOT`:
 * `mask(90) ‖ disclosedBytes(90)`, one field per element — what the library's
 * `verify_zkpassport_proof` loads when the contract's query discloses a field.
 */
export function assembleDiscloseCapsule(discloseMask: number[], disclosedBytes: number[]): Fr[] {
  if (discloseMask.length !== MRZ_LENGTH || disclosedBytes.length !== MRZ_LENGTH) {
    throw new Error(
      `disclose payload shape mismatch: mask ${discloseMask.length}/${MRZ_LENGTH}, ` +
        `bytes ${disclosedBytes.length}/${MRZ_LENGTH}`,
    )
  }
  return [...discloseMask, ...disclosedBytes].map((b) => new Fr(BigInt(b)))
}

/**
 * Assemble the capsule for `SANCTIONS_CAPSULE_SLOT` from the sanctions root the proof was made
 * against, the SDK's `SanctionsCommittedInputs.rootHash`.
 */
export function assembleSanctionsCapsule(rootHash: string): Fr[] {
  return [Fr.fromHexString(rootHash)]
}
