import { Fr } from "@aztec-labs/aztec.js/fields"
import type { FacematchCommittedInputs } from "@zkpassport/utils"

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

/**
 * Assemble the capsule for `FACE_MATCH_CAPSULE_SLOT` from the values the proof's facematch subproof
 * commits to, the SDK's `FacematchCommittedInputs`: root key leaf, environment, app id hash,
 * integrity key hash and mode, the circuits' encoding of each.
 */
export function assembleFacematchCapsule(inputs: FacematchCommittedInputs): Fr[] {
  return [
    Fr.fromHexString(inputs.rootKeyLeaf),
    new Fr(inputs.environment === "production" ? 1n : 0n),
    Fr.fromHexString(inputs.appIdHash),
    Fr.fromHexString(inputs.integrityPubkeyHash),
    new Fr(inputs.mode === "strict" ? 2n : 1n),
  ]
}
