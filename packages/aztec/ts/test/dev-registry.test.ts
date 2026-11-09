import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { SchnorrInitializerlessAccountContract } from "@aztec-labs/accounts/schnorr"
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing"
import {
  computePartialAddress,
  getContractInstanceFromInstantiationParams,
} from "@aztec-labs/stdlib/contract"
import { deriveKeys } from "@aztec-labs/stdlib/keys"

import {
  DEV_REGISTRY_ADMIN,
  DEV_REGISTRY_OPERATOR,
  DEV_REGISTRY_SALT,
  getDevRegistryAddress,
} from "../src/dev-registry.ts"

const DEV_REGISTRY_NR = readFileSync(
  new URL("../../noir/verifier/src/dev_registry.nr", import.meta.url),
  "utf8",
)

function noirGlobal(name: string): bigint {
  const match = DEV_REGISTRY_NR.match(
    new RegExp(`global ${name}: [^=]+=\\s*(?:AztecAddress \\{\\s*inner:\\s*)?(0x[0-9a-f]{64})`),
  )
  assert.ok(match, `${name} not found in dev_registry.nr`)
  return BigInt(match[1])
}

async function localNetworkTestAccount(index: number) {
  const account = (await getInitialTestAccountsData())[index]
  const accountContract = new SchnorrInitializerlessAccountContract(account.signingKey)
  const instance = await getContractInstanceFromInstantiationParams(
    await accountContract.getContractArtifact(),
    {
      salt: account.salt,
      publicKeys: (await deriveKeys(account.secret)).publicKeys,
      immutablesHash: await accountContract.getImmutablesHash(),
    },
  )
  assert.ok(instance.address.equals(account.address))
  return { ...account, partialAddress: await computePartialAddress(instance) }
}

test("the dev registry's admin and operator are the local network's test accounts 0 and 1", async () => {
  const roles = [
    { index: 0, role: "ADMIN", address: DEV_REGISTRY_ADMIN },
    { index: 1, role: "OPERATOR", address: DEV_REGISTRY_OPERATOR },
  ]
  for (const { index, role, address } of roles) {
    const account = await localNetworkTestAccount(index)
    assert.equal(address.toString(), account.address.toString())
    assert.equal(noirGlobal(`DEV_${role}_SECRET`), account.secret.toBigInt())
    assert.equal(noirGlobal(`DEV_${role}_PARTIAL_ADDRESS`), account.partialAddress.toBigInt())
  }
})

test("the dev registry's salt is sha256_to_field of its name", () => {
  const digest = createHash("sha256").update("ZKPASSPORT::AZTEC::DEV_REGISTRY").digest()
  assert.equal(DEV_REGISTRY_SALT.toBigInt(), BigInt(`0x${digest.subarray(0, 31).toString("hex")}`))
})

test("the compiled registry deploys at DEV_REGISTRY_ADDRESS", async () => {
  const noirAddress = `0x${noirGlobal("DEV_REGISTRY_ADDRESS").toString(16).padStart(64, "0")}`
  assert.equal((await getDevRegistryAddress()).toString(), noirAddress)
})
