import { Fr } from "@aztec/aztec.js/fields"

import { MRZ_LENGTH, outerPublicInputCount, PROOF_FIELDS, VK_FIELDS } from "./constants.ts"

/** The three field groups of an outer proof, as hex strings from the SDK/utils. */
export interface OuterProofParts {
  vk: string[]
  proof: string[]
  publicInputs: string[]
}

/**
 * Assemble the proof-capsule blob the library's `load_proof_capsule` consumes:
 * `vk(115) ‖ proof(458) ‖ public_inputs(K + 5)`, which can then be delivered on
 * `PROOF_CAPSULE_SLOT` of the verifier contract.
 *
 * Shape-checks first: the on-chain load of a wrong-shaped blob just returns
 * None ("missing zkpassport proof capsule"). `k` is the outer circuit's subproof count
 * (`outer_count_5` → 5, the shape current SDK queries produce).
 *
 * Parsing note: the SDK/utils emit field elements as BARE hex (no `0x`).
 * `Fr.fromString` would reject those — and silently misread an all-digit hex
 * string as decimal — so every element is parsed explicitly as hex.
 */
export function assembleProofCapsule(parts: OuterProofParts, k = 5): Fr[] {
  const wantPIs = outerPublicInputCount(k)
  if (
    parts.vk.length !== VK_FIELDS ||
    parts.proof.length !== PROOF_FIELDS ||
    parts.publicInputs.length !== wantPIs
  ) {
    throw new Error(
      `zkPassport outer-proof shape mismatch: vk ${parts.vk.length}/${VK_FIELDS}, ` +
        `proof ${parts.proof.length}/${PROOF_FIELDS}, public inputs ` +
        `${parts.publicInputs.length}/${wantPIs} — expected outer_count_${k}; the phone ` +
        `likely proved a different circuit version than the pinned one`,
    )
  }
  return [...parts.vk, ...parts.proof, ...parts.publicInputs].map((h) => Fr.fromHexString(h))
}

/**
 * Assemble the disclose preimage for `DISCLOSE_CAPSULE_SLOT`:
 * `mask(90) ‖ disclosedBytes(90)`, one field per element — what the library's
 * `load_disclose_payload` consumes (nationality claims only).
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
