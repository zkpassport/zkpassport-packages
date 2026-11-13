import {
  AZTEC_DISCLOSE_CAPSULE_SLOT,
  AZTEC_FACE_MATCH_CAPSULE_SLOT,
  AZTEC_PROOF_CAPSULE_SLOT,
  AZTEC_SANCTIONS_CAPSULE_SLOT,
  AztecCapsule,
  AztecVerifierParameters,
  Binary,
  BindCommittedInputs,
  DiscloseCommittedInputs,
  FacematchCommittedInputs,
  getAztecDiscloseCapsule,
  getAztecFacematchCapsule,
  getAztecProofCapsule,
  getAztecSanctionsCapsule,
  getNumberOfPublicInputs,
  getProofData,
  ProofResult,
  SanctionsCommittedInputs,
  SupportedChain,
  ultraVkToFields,
} from "@zkpassport/utils"
import type { RegistryClient } from "@zkpassport/registry"

export class AztecVerifier {
  /**
   * The capsules an Aztec contract's `verify_zkpassport_proof` reads for an `outer_count_N` proof:
   * the proof capsule, then the disclose, sanctions and face match capsules of the committed
   * inputs the proof carries. The outer circuit's vk comes from `registryClient`, checked against
   * the circuit manifest of the proof's version and against the proof's vk hash.
   */
  public static async getParameters({
    proof,
    registryClient,
  }: {
    proof: ProofResult
    registryClient: RegistryClient
  }): Promise<AztecVerifierParameters> {
    const subproofs = Number(proof.name?.match(/^outer_count_(\d+)$/)?.[1])
    if (!subproofs) {
      throw new Error(
        "This proof cannot be verified on Aztec. Please make sure to use the `compressed` mode.",
      )
    }
    if (!proof.proof || !proof.vkeyHash || !proof.version) {
      throw new Error(`The ${proof.name} proof is missing its proof, vkey hash or version`)
    }

    const manifest = await registryClient.getCircuitManifest(undefined, { version: proof.version })
    const circuit = await registryClient.getPackagedCircuit(proof.name!, manifest)
    if (BigInt(hexPrefixed(circuit.vkey_hash)) !== BigInt(hexPrefixed(proof.vkeyHash))) {
      throw new Error(
        `The ${proof.name} proof's vkey hash ${proof.vkeyHash} is not ${circuit.vkey_hash}, ` +
          `the circuits release ${proof.version} has`,
      )
    }

    const vk = ultraVkToFields(Binary.fromBase64(circuit.vkey).toUInt8Array())
    const proofData = getProofData(proof.proof, getNumberOfPublicInputs(proof.name!))
    const capsules: AztecCapsule[] = [
      {
        slot: AZTEC_PROOF_CAPSULE_SLOT,
        fields: getAztecProofCapsule(
          { vk, proof: proofData.proof, publicInputs: proofData.publicInputs },
          subproofs,
        ),
      },
    ]

    const committedInputs = proof.committedInputs ?? {}
    const disclose = committedInputs.disclose_bytes as DiscloseCommittedInputs | undefined
    if (disclose) {
      capsules.push({
        slot: AZTEC_DISCLOSE_CAPSULE_SLOT,
        fields: getAztecDiscloseCapsule(disclose.discloseMask, disclose.disclosedBytes),
      })
    }
    const sanctions = committedInputs.exclusion_check_sanctions as
      SanctionsCommittedInputs | undefined
    if (sanctions) {
      capsules.push({
        slot: AZTEC_SANCTIONS_CAPSULE_SLOT,
        fields: getAztecSanctionsCapsule(sanctions.rootHash),
      })
    }
    const facematch = committedInputs.facematch as FacematchCommittedInputs | undefined
    if (facematch) {
      capsules.push({
        slot: AZTEC_FACE_MATCH_CAPSULE_SLOT,
        fields: getAztecFacematchCapsule(facematch),
      })
    }

    return { capsules }
  }

  /**
   * The Aztec network whose circuits host serves a proof's vk: the network the proof is bound to,
   * or Aztec mainnet for a proof bound to no Aztec network
   */
  public static getChain(proof: ProofResult): SupportedChain {
    const chain = (proof.committedInputs?.bind as BindCommittedInputs | undefined)?.data.chain
    return chain === "aztec_testnet" ? "aztec_testnet" : "aztec"
  }
}

function hexPrefixed(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`
}
