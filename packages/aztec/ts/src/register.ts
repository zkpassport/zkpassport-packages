import type { ContractArtifact } from "@aztec-labs/aztec.js/abi"
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import type { Fr } from "@aztec-labs/aztec.js/fields"
import { getContractClassFromArtifact } from "@aztec-labs/stdlib/contract"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"

import { ZKPassportRegistryArtifact } from "./artifact.ts"

export interface RegistryNode {
  getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined>
}

/** The slice of an aztec.js `Wallet` that registration uses. */
export interface RegistryWallet {
  registerContract(
    instance: ContractInstanceWithAddress,
    artifact: ContractArtifact,
  ): Promise<unknown>
  getContractMetadata(address: AztecAddress): Promise<{ instance?: unknown }>
  getContractClassMetadata(id: Fr): Promise<{ isArtifactRegistered: boolean }>
}

/**
 * Register the shared ZKPassportRegistry's artifact with the wallet's PXE.
 *
 * Any app whose verifier calls `verify_zkpassport_proof*` needs this once per
 * wallet: the verifier privately `.view()`s the registry, and the PXE executes
 * that call locally during simulation/proving.
 *
 * Registration is skipped only when the wallet reports both the registry's
 * instance and the artifact of its current class. After the registry is
 * upgraded, a wallet that still holds the old class's artifact is registered
 * again with the current one.
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

  // The PXE resolves the current class from chain state and looks its artifact up by class id, so
  // knowing the address is not enough once `update_to` has moved the registry to a new class.
  const [{ instance: known }, { isArtifactRegistered }] = await Promise.all([
    wallet.getContractMetadata(address),
    wallet.getContractClassMetadata(expected),
  ])
  if (known && isArtifactRegistered) return instance
  await wallet.registerContract(instance, artifact)
  return instance
}
