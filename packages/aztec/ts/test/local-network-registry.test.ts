import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing"
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { Fr } from "@aztec-labs/aztec.js/fields"
import { getContractInstanceFromInstantiationParams } from "@aztec-labs/stdlib/contract"

import { ZKPassportRegistryArtifact } from "../src/artifact.ts"

const REGISTRY_SRC = new URL("../../noir/registry_contract/src/", import.meta.url)
const LOCAL_NETWORK_REGISTRY_NR = readFileSync(
  new URL("local_network_registry.nr", REGISTRY_SRC),
  "utf8",
)
const TYPES_NR = readFileSync(new URL("types.nr", REGISTRY_SRC), "utf8")

// The value a Noir global is initialized with, as the first capture group of `value`
function noirGlobal(source: string, name: string, value: string): string {
  const match = source.match(new RegExp(`global ${name}: [^=]+=\\s*${value}`))
  assert.ok(match, `${name} not found`)
  return match[1]
}

const noirAddress = (name: string) =>
  noirGlobal(LOCAL_NETWORK_REGISTRY_NR, name, "AztecAddress::from_field\\(\\s*(0x[0-9a-f]{64})")

// sha256_to_field: the first 31 bytes of the sha256 digest
function sha256ToField(value: string): Fr {
  const digest = createHash("sha256").update(value).digest()
  return Fr.fromHexString(`0x${digest.subarray(0, 31).toString("hex")}`)
}

test("the admin and operator are the local network's test accounts 0 and 1", async () => {
  const [admin, operator] = await getInitialTestAccountsData()
  assert.equal(admin.address.toString(), noirAddress("LOCAL_NETWORK_REGISTRY_ADMIN"))
  assert.equal(operator.address.toString(), noirAddress("LOCAL_NETWORK_REGISTRY_OPERATOR"))
})

test("the compiled registry deploys at LOCAL_NETWORK_REGISTRY_ADDRESS", async () => {
  const saltName = noirGlobal(
    LOCAL_NETWORK_REGISTRY_NR,
    "LOCAL_NETWORK_REGISTRY_SALT",
    'sha256_to_field\\("([^"]+)"\\.as_bytes\\(\\)\\)',
  )
  const instance = await getContractInstanceFromInstantiationParams(ZKPassportRegistryArtifact, {
    constructorArtifact: "constructor",
    constructorArgs: [
      AztecAddress.fromStringUnsafe(noirAddress("LOCAL_NETWORK_REGISTRY_ADMIN")),
      AztecAddress.fromStringUnsafe(noirAddress("LOCAL_NETWORK_REGISTRY_OPERATOR")),
      Number(noirGlobal(TYPES_NR, "MODE_VALID_WITHIN_WINDOW", "(\\d+)")),
      Number(
        noirGlobal(LOCAL_NETWORK_REGISTRY_NR, "LOCAL_NETWORK_REGISTRY_VALIDITY_WINDOW", "(\\d+)"),
      ),
    ],
    salt: sha256ToField(saltName),
    deployer: AztecAddress.ZERO,
  })
  assert.equal(instance.address.toString(), noirAddress("LOCAL_NETWORK_REGISTRY_ADDRESS"))
})
