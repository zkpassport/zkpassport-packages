import type { ContractArtifact } from "@aztec/aztec.js/abi"
import { AztecAddress } from "@aztec/aztec.js/addresses"
import { getContractClassFromArtifact } from "@aztec/stdlib/contract"
import type { ContractInstanceWithAddress } from "@aztec/stdlib/contract"

import { ZKPassportRegistryArtifact } from "./artifact.ts"

/** The one node method registration needs (structural, so any node client fits). */
export interface RegistryNode {
  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined>
}

/** The wallet surface registration needs (structural: EmbeddedWallet et al. fit). */
export interface RegistryWallet {
  registerContract(
    instance: ContractInstanceWithAddress,
    artifact: ContractArtifact,
  ): Promise<unknown>
  /** Optional fast path: skip re-registering an already-known contract. */
  hasContract?(address: AztecAddress): Promise<boolean>
}

/**
 * Register the shared ZKPassportRegistry's artifact with the wallet's PXE.
 *
 * Any app whose verifier calls `verify_zkpassport_proof*` needs this once per
 * wallet: the verifier privately `.view()`s the registry, and the PXE executes
 * that call locally during simulation/proving — without the artifact the claim
 * dies mid-proof with "No artifact registered for contract class …" (err 14).
 *
 * The on-chain instance's class id is checked against the artifact first, so a
 * stale/mismatched build (e.g. a preview-delay artifact against the production
 * registry — a different `INITIAL_DELAY` is a different class) fails here with
 * an actionable message instead of at claim time.
 */
export async function registerZKPassportRegistry(
  wallet: RegistryWallet,
  node: RegistryNode,
  registryAddress: AztecAddress | string,
  artifact: ContractArtifact = ZKPassportRegistryArtifact,
): Promise<ContractInstanceWithAddress> {
  const address =
    typeof registryAddress === "string"
      ? AztecAddress.fromStringUnsafe(registryAddress)
      : registryAddress

  const instance = await node.getContract(address)
  if (!instance) {
    throw new Error(
      `no contract at ${address.toString()} on this node — wrong network, or the registry is not deployed there`,
    )
  }

  const expected = (await getContractClassFromArtifact(artifact)).id
  if (!instance.currentContractClassId.equals(expected)) {
    throw new Error(
      `ZKPassportRegistry artifact is class ${expected.toString()} but the registry at ` +
        `${address.toString()} is class ${instance.currentContractClassId.toString()} — ` +
        `swap in the artifact of the deployed build (a different INITIAL_DELAY is a different class)`,
    )
  }

  if (wallet.hasContract && (await wallet.hasContract(address))) return instance
  await wallet.registerContract(instance, artifact)
  return instance
}
