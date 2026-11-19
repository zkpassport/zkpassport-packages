import assert from "node:assert/strict"
import { test } from "node:test"

import type { ContractArtifact } from "@aztec-labs/aztec.js/abi"
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { Fr } from "@aztec-labs/aztec.js/fields"
import { getContractClassFromArtifact } from "@aztec-labs/stdlib/contract"
import type { ContractInstanceWithAddress } from "@aztec-labs/stdlib/contract"

import { ZKPassportRegistryArtifact } from "../src/artifact.ts"
import { registerZKPassportRegistry, type RegistryWallet } from "../src/register.ts"

const ADDRESS = "0x2993422d9415492ab74a962d9884c7c5010edd30e05caaa6d2b98bfbc714c7f2"

function fakes(classId: Fr) {
  const registered: unknown[] = []
  const node = {
    getContract: async () =>
      ({ currentContractClassId: classId }) as unknown as ContractInstanceWithAddress,
  }
  const wallet: RegistryWallet = {
    registerContract: async (instance) => {
      registered.push(instance)
    },
  }
  return { node, wallet, registered }
}

test("artifact loads and its contract class id computes", async () => {
  const cls = await getContractClassFromArtifact(ZKPassportRegistryArtifact)
  assert.ok(!cls.id.isZero())
})

test("registers when the on-chain class matches the artifact", async () => {
  const cls = await getContractClassFromArtifact(ZKPassportRegistryArtifact)
  const { node, wallet, registered } = fakes(cls.id)
  await registerZKPassportRegistry(wallet, node, ADDRESS)
  assert.equal(registered.length, 1)
})

test("skips registration when the wallet has the instance and the current class's artifact", async () => {
  const cls = await getContractClassFromArtifact(ZKPassportRegistryArtifact)
  const { node, wallet, registered } = fakes(cls.id)
  wallet.getContractMetadata = async () => ({ instance: {} })
  wallet.getContractClassMetadata = async (id) => ({ isArtifactRegistered: id.equals(cls.id) })
  await registerZKPassportRegistry(wallet, node, ADDRESS)
  assert.equal(registered.length, 0)
})

/**
 * A wallet shaped like aztec.js 6.0's BaseWallet: artifacts keyed by class id, instances by address. The PXE resolves
 * an instance's current class from the chain, so a call only works when the artifact for that class is stored.
 * `hasContract` only says the address is known, which on its own must not skip registration.
 */
function pxeWallet() {
  const artifacts = new Map<string, ContractArtifact>()
  const instances = new Map<string, ContractInstanceWithAddress>()
  return {
    artifacts,
    instances,
    async registerContract(instance: ContractInstanceWithAddress, artifact: ContractArtifact) {
      artifacts.set((await getContractClassFromArtifact(artifact)).id.toString(), artifact)
      instances.set(instance.address.toString(), instance)
    },
    async hasContract(address: AztecAddress) {
      return instances.has(address.toString())
    },
    async getContractMetadata(address: AztecAddress) {
      return { instance: instances.get(address.toString()) }
    },
    async getContractClassMetadata(id: Fr) {
      return { isArtifactRegistered: artifacts.has(id.toString()) }
    },
  }
}

test("registers the current artifact when the wallet knows the address under an older class", async () => {
  const current = (await getContractClassFromArtifact(ZKPassportRegistryArtifact)).id
  const old = new Fr(0x01dn)
  const address = AztecAddress.fromStringUnsafe(ADDRESS)
  const upgraded = {
    address,
    originalContractClassId: old,
    currentContractClassId: current,
  } as unknown as ContractInstanceWithAddress
  const node = { getContract: async () => upgraded }

  const wallet = pxeWallet()
  wallet.instances.set(ADDRESS, { ...upgraded, currentContractClassId: old })
  wallet.artifacts.set(old.toString(), { name: "ZKPassportRegistry" } as ContractArtifact)

  await registerZKPassportRegistry(wallet, node, ADDRESS)

  assert.equal((await wallet.getContractClassMetadata(current)).isArtifactRegistered, true)
})

test("rejects a class mismatch with both ids in the message", async () => {
  const { node, wallet } = fakes(new Fr(0xdeadn))
  await assert.rejects(
    registerZKPassportRegistry(wallet, node, ADDRESS),
    /is class 0x[0-9a-f]*dead.*INITIAL_DELAY/s,
  )
})

test("rejects an address with no contract on the node", async () => {
  const node = { getContract: async () => undefined }
  const { wallet } = fakes(new Fr(1n))
  await assert.rejects(registerZKPassportRegistry(wallet, node, ADDRESS), /no contract at/)
})
