import {
  AZTEC_DISCLOSE_CAPSULE_SLOT,
  AZTEC_PROOF_CAPSULE_SLOT,
  AZTEC_SANCTIONS_CAPSULE_SLOT,
  AztecCapsule,
  AztecVerifierParameters,
  Binary,
  BindCommittedInputs,
  DiscloseCommittedInputs,
  getAztecDiscloseCapsule,
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
   * The capsules an Aztec contract's `verify_zkpassport_proof` reads for an `outer_count_N` proof
   * of circuits 0.23.x: the proof capsule, then the disclose and sanctions capsules of the
   * committed inputs the proof carries. The outer circuit's vk comes from `registryClient`,
   * checked against the circuit manifest of the proof's version and against the proof's vk hash.
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
    if (!isAztecSupportedCircuitVersion(proof.version)) {
      throw new Error(
        `Circuits ${proof.version} proofs cannot be verified on Aztec: ZKPassport's Aztec library ` +
          `verifies circuits ${AZTEC_SUPPORTED_CIRCUIT_VERSION_LABEL}`,
      )
    }
    const committedInputs = proof.committedInputs ?? {}
    if (committedInputs.facematch) {
      throw new Error("Proofs with a face match cannot be verified on Aztec yet")
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
          subproofs,
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

    return { capsules }
  }

  /**
   * The Aztec network whose circuits host serves a proof's vk: the network the proof is bound to,
   * or `network` for a proof bound to none. The Aztec library's bind covers a user address and the
   * contract's network, nothing else, so a proof whose bind holds anything else never verifies, nor
   * does a proof bound to one network on another: each of these is an error, as is a proof bound
   * to no network without a `network`.
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

    const { user_address, chain, custom_data } = bind.data
    if (!user_address || !chain || custom_data || !/^0x[0-9a-fA-F]{64}$/.test(user_address)) {
      throw new Error(
        "This proof's bind cannot be verified on Aztec, which binds a 32-byte user address and an " +
          "Aztec network only: request a new proof that binds the user's address and the network",
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

function hexPrefixed(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`
}
