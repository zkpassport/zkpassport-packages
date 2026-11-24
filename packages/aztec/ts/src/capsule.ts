import type { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { Fr } from "@aztec-labs/aztec.js/fields"
import { Capsule } from "@aztec-labs/aztec.js/tx"
import {
  type AztecVerifierParameters,
  getAztecDiscloseCapsule,
  getAztecProofCapsule,
  getAztecSanctionsCapsule,
} from "@zkpassport/utils"

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
 * The capsules of the SDK's `getAztecVerifierParameters` for `contract`, scoped to `sender`, the
 * account whose PXE sends the transaction: pass them as the `capsules` of the call that verifies
 * the proof.
 */
export function toAztecCapsules(
  params: AztecVerifierParameters,
  contract: AztecAddress,
  sender: AztecAddress,
): Capsule[] {
  return params.capsules.map(
    ({ slot, fields }) =>
      new Capsule(contract, new Fr(BigInt(slot)), fields.map(Fr.fromHexString), sender),
  )
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
 * The SDK/utils emit field elements as bare hex (no `0x`), which are read as hex, never as
 * decimal.
 */
export function assembleProofCapsule(parts: OuterProofParts, k = 5): Fr[] {
  return getAztecProofCapsule(parts, k).map(Fr.fromHexString)
}

/**
 * Assemble the disclose preimage for `DISCLOSE_CAPSULE_SLOT`:
 * `mask(90) ‖ disclosedBytes(90)`, one field per element — what the library's
 * `verify_zkpassport_proof` loads when the contract's query discloses a field.
 */
export function assembleDiscloseCapsule(discloseMask: number[], disclosedBytes: number[]): Fr[] {
  return getAztecDiscloseCapsule(discloseMask, disclosedBytes).map(Fr.fromHexString)
}

/**
 * Assemble the capsule for `SANCTIONS_CAPSULE_SLOT` from the sanctions root the proof was made
 * against, the SDK's `SanctionsCommittedInputs.rootHash`.
 */
export function assembleSanctionsCapsule(rootHash: string): Fr[] {
  return getAztecSanctionsCapsule(rootHash).map(Fr.fromHexString)
}
