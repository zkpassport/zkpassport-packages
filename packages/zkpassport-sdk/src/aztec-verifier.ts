import {
  AZTEC_ATTESTED_ID_CAPSULE_SLOT,
  AZTEC_DISCLOSE_CAPSULE_SLOT,
  AZTEC_FACE_MATCH_CAPSULE_SLOT,
  AZTEC_PROOF_CAPSULE_SLOT,
  AZTEC_SANCTIONS_CAPSULE_SLOT,
  AztecCapsule,
  AztecVerifierParameters,
  AttestedIdCommittedInputs,
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
  AZTEC_SUPPORTED_CIRCUIT_VERSION_LABEL,
  isAztecSupportedCircuitVersion,
  ProofResult,
  SanctionsCommittedInputs,
  ultraVkToFields,
} from "@zkpassport/utils"
import type { RegistryClient } from "@zkpassport/registry"

/** The Aztec networks ZKPassport's Aztec library has a registry on */
export type AztecNetwork = "aztec" | "aztec_testnet"

export class AztecVerifier {
  /**
   * The capsules an Aztec contract reads for a circuits 0.23.x proof: for an `outer_count_N` proof,
   * or an Aadhaar's `outer_aadhaar_count_N` proof, with `verify_zkpassport_proof`, the proof
   * capsule, then the disclose, sanctions and face match capsules of the committed inputs the proof
   * carries; for an `outer_attested_id_count_N` proof of
   * an ID read by camera, with `verify_device_attested_proof`, the proof capsule, the disclose and
   * sanctions capsules, and the attested ID capsule of its device attestation. The outer circuit's
   * vk comes from `registryClient`, checked against the circuit manifest of the proof's version and
   * against the proof's vk hash.
   */
  public static async getParameters({
    proof,
    registryClient,
  }: {
    proof: ProofResult
    registryClient: RegistryClient
  }): Promise<AztecVerifierParameters> {
    const outer = proof.name?.match(/^outer_(attested_id_|aadhaar_)?count_(\d+)$/)
    const attested = outer?.[1] === "attested_id_"
    const subproofs = Number(outer?.[2])
    // An Aadhaar's single base proof stands in for the chip's 3, so its proof has the layout of the
    // outer_count proof with 2 more subproofs
    const chipSubproofs = outer?.[1] === "aadhaar_" ? subproofs + 2 : subproofs
    if (!subproofs) {
      throw new Error(
        "This proof cannot be verified on Aztec. Please make sure to use the `compressed` mode.",
      )
    }
    if (!proof.proof || !proof.vkeyHash || !proof.version) {
      throw new Error(`The ${proof.name} proof is missing its proof, vkey hash or version`)
    }
    if (!isAztecSupportedCircuitVersion(proof.version)) {
      throw new Error(
        `Circuits ${proof.version} proofs cannot be verified on Aztec: ZKPassport's Aztec library ` +
          `verifies circuits ${AZTEC_SUPPORTED_CIRCUIT_VERSION_LABEL}`,
      )
    }
    const committedInputs = proof.committedInputs ?? {}
    const facematch = committedInputs.facematch as FacematchCommittedInputs | undefined
    const attestation = (committedInputs.attested_id_ios ?? committedInputs.attested_id_android) as
      AttestedIdCommittedInputs | undefined
    if (attested && !attestation) {
      throw new Error(`The ${proof.name} proof is missing its attested ID inputs`)
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
    const proofData = getProofData(proof.proof, getNumberOfPublicInputs(proof.name!, proof.version))
    const capsules: AztecCapsule[] = [
      {
        slot: AZTEC_PROOF_CAPSULE_SLOT,
        fields: getAztecProofCapsule(
          {
            vk,
            proof: proofData.proof,
            publicInputs: proofData.publicInputs,
            version: proof.version,
          },
          chipSubproofs,
          attested,
        ),
      },
    ]

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
    if (facematch) {
      capsules.push({
        slot: AZTEC_FACE_MATCH_CAPSULE_SLOT,
        fields: getAztecFacematchCapsule(facematch),
      })
    }
    // The attestation's parameters are a face match's, in the same order
    if (attestation) {
      capsules.push({
        slot: AZTEC_ATTESTED_ID_CAPSULE_SLOT,
        fields: getAztecFacematchCapsule(attestation),
      })
    }

    return { capsules }
  }

  /**
   * The Aztec network whose circuits host serves a proof's vk: the network the proof is bound to,
   * or `network` for a proof bound to none. The Aztec library's bind covers the contract's network
   * and a 32-byte user address, custom data of at most 464 bytes or both, so a proof whose bind holds
   * anything else never verifies, nor does a proof bound to one network on another: each of these is
   * an error, as is a proof bound to no network without a `network`.
   */
  public static getChain(proof: ProofResult, network?: AztecNetwork): AztecNetwork {
    const bind = proof.committedInputs?.bind as BindCommittedInputs | undefined
    if (!bind) {
      if (!network) {
        throw new Error(
          "This proof is bound to no Aztec network: pass the network it will be verified on",
        )
      }
      return network
    }

    const { user_address, chain } = bind.data
    // formatBoundData writes no custom data entry for an empty string
    const custom_data = bind.data.custom_data || undefined
    const bindsAddress = user_address !== undefined && /^0x[0-9a-fA-F]{64}$/.test(user_address)
    const bindsCustomData =
      custom_data !== undefined &&
      new TextEncoder().encode(custom_data).length <= AZTEC_CUSTOM_DATA_MAX_LENGTH
    if (
      !chain ||
      (user_address !== undefined && !bindsAddress) ||
      (custom_data !== undefined && !bindsCustomData) ||
      (!bindsAddress && !bindsCustomData)
    ) {
      throw new Error(
        "This proof's bind cannot be verified on Aztec, which binds an Aztec network with a 32-byte " +
          "user address, custom data of at most 464 bytes or both: request a new proof that binds " +
          "them",
      )
    }
    if (chain !== "aztec" && chain !== "aztec_testnet") {
      throw new Error(`This proof is bound to ${chain}, so it cannot be verified on Aztec`)
    }
    if (network && network !== chain) {
      throw new Error(`This proof is bound to ${chain}, so it cannot be verified on ${network}`)
    }
    return chain
  }
}

// The most custom data, in UTF-8 bytes, ZKPassport's Aztec library binds
const AZTEC_CUSTOM_DATA_MAX_LENGTH = 464

function hexPrefixed(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`
}
