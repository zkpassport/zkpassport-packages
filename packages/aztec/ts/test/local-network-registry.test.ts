import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing"

import {
  LOCAL_NETWORK_REGISTRY_SALT,
  getLocalNetworkRegistryAddress,
} from "../src/local-network-registry.ts"

const LOCAL_NETWORK_REGISTRY_NR = readFileSync(
  new URL("../../noir/registry_contract/src/local_network_registry.nr", import.meta.url),
  "utf8",
)

// An AztecAddress global of local_network_registry.nr, as the 0x-prefixed hex AztecAddress.toString
// gives
function noirAddress(name: string): string {
  const match = LOCAL_NETWORK_REGISTRY_NR.match(
    new RegExp(`global ${name}: AztecAddress =\\s*AztecAddress \\{\\s*inner:\\s*(0x[0-9a-f]{64})`),
  )
  assert.ok(match, `${name} not found in local_network_registry.nr`)
  return match[1]
}

test("the admin and operator are the local network's test accounts 0 and 1", async () => {
  const [admin, operator] = await getInitialTestAccountsData()
  assert.equal(admin.address.toString(), noirAddress("LOCAL_NETWORK_REGISTRY_ADMIN"))
  assert.equal(operator.address.toString(), noirAddress("LOCAL_NETWORK_REGISTRY_OPERATOR"))
})

test("the local network registry's salt is sha256_to_field of its name", () => {
  const digest = createHash("sha256").update("ZKPASSPORT::AZTEC::LOCAL_NETWORK_REGISTRY").digest()
  assert.equal(
    LOCAL_NETWORK_REGISTRY_SALT.toBigInt(),
    BigInt(`0x${digest.subarray(0, 31).toString("hex")}`),
  )
})

test("the compiled registry deploys at LOCAL_NETWORK_REGISTRY_ADDRESS", async () => {
  assert.equal(
    (await getLocalNetworkRegistryAddress()).toString(),
    noirAddress("LOCAL_NETWORK_REGISTRY_ADDRESS"),
  )
})
