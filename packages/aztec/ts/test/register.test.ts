import assert from "node:assert/strict"
import { test } from "node:test"

import { Fr } from "@aztec/aztec.js/fields"
import { getContractClassFromArtifact } from "@aztec/stdlib/contract"
import type { ContractInstanceWithAddress } from "@aztec/stdlib/contract"

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

test("skips registration when the wallet already has the contract", async () => {
  const cls = await getContractClassFromArtifact(ZKPassportRegistryArtifact)
  const { node, wallet, registered } = fakes(cls.id)
  wallet.hasContract = async () => true
  await registerZKPassportRegistry(wallet, node, ADDRESS)
  assert.equal(registered.length, 0)
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
