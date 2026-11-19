import assert from "node:assert/strict"
import { test } from "node:test"

import type { ContractArtifact } from "@aztec-labs/aztec.js/abi"
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { Fr } from "@aztec-labs/aztec.js/fields"
import { getContractClassFromArtifact } from "@aztec-labs/stdlib/contract"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"

import { ZKPassportRegistryArtifact } from "../src/artifact.ts"
import { registerZKPassportRegistry } from "../src/register.ts"

const ADDRESS = "0x2993422d9415492ab74a962d9884c7c5010edd30e05caaa6d2b98bfbc714c7f2"

function onChain(currentContractClassId: Fr, originalContractClassId = currentContractClassId) {
  return {
    address: AztecAddress.fromStringUnsafe(ADDRESS),
    originalContractClassId,
    currentContractClassId,
  } as unknown as ContractInstanceWithAddress
}

function nodeWith(instance: ContractInstanceWithAddress | undefined) {
  return { getContract: async () => instance }
}

/**
 * A wallet shaped like aztec.js 6.0's BaseWallet: artifacts keyed by class id, instances by address. The PXE resolves
 * an instance's current class from the chain, so a call only works when the artifact for that class is stored.
 */
function pxeWallet() {
  const artifacts = new Map<string, ContractArtifact>()
  const instances = new Map<string, ContractInstanceWithAddress>()
  const registered: ContractInstanceWithAddress[] = []
  return {
    artifacts,
    instances,
    registered,
    async registerContract(instance: ContractInstanceWithAddress, artifact: ContractArtifact) {
      registered.push(instance)
      artifacts.set((await getContractClassFromArtifact(artifact)).id.toString(), artifact)
      instances.set(instance.address.toString(), instance)
    },
    async getContractMetadata(address: AztecAddress) {
      return { instance: instances.get(address.toString()) }
    },
    async getContractClassMetadata(id: Fr) {
      return { isArtifactRegistered: artifacts.has(id.toString()) }
    },
  }
}

test("artifact loads and its contract class id computes", async () => {
  const cls = await getContractClassFromArtifact(ZKPassportRegistryArtifact)
  assert.ok(!cls.id.isZero())
})

test("registers when the on-chain class matches the artifact", async () => {
  const cls = await getContractClassFromArtifact(ZKPassportRegistryArtifact)
  const wallet = pxeWallet()
  await registerZKPassportRegistry(wallet, nodeWith(onChain(cls.id)), ADDRESS)
  assert.equal(wallet.registered.length, 1)
})

test("skips registration when the wallet has the instance and the current class's artifact", async () => {
  const cls = await getContractClassFromArtifact(ZKPassportRegistryArtifact)
  const wallet = pxeWallet()
  const node = nodeWith(onChain(cls.id))
  await registerZKPassportRegistry(wallet, node, ADDRESS)
  await registerZKPassportRegistry(wallet, node, ADDRESS)
  assert.equal(wallet.registered.length, 1)
})

test("registers the current artifact when the wallet knows the address under an older class", async () => {
  const current = (await getContractClassFromArtifact(ZKPassportRegistryArtifact)).id
  const old = new Fr(0x01dn)

  const wallet = pxeWallet()
  wallet.instances.set(ADDRESS, onChain(old))
  wallet.artifacts.set(old.toString(), { name: "ZKPassportRegistry" } as ContractArtifact)

  await registerZKPassportRegistry(wallet, nodeWith(onChain(current, old)), ADDRESS)

  assert.equal((await wallet.getContractClassMetadata(current)).isArtifactRegistered, true)
})

test("rejects a class mismatch with both ids in the message", async () => {
  await assert.rejects(
    registerZKPassportRegistry(pxeWallet(), nodeWith(onChain(new Fr(0xdeadn))), ADDRESS),
    /is class 0x[0-9a-f]*dead.*INITIAL_DELAY/s,
  )
})

test("rejects an address with no contract on the node", async () => {
  await assert.rejects(
    registerZKPassportRegistry(pxeWallet(), nodeWith(undefined), ADDRESS),
    /no contract at/,
  )
})
