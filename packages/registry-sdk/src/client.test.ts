import { describe, expect, test } from "bun:test"
import { RegistryClient } from "./client"

describe("RegistryClient.forChain", () => {
  test("throws for a chain RegistryClient does not support", () => {
    expect(() => RegistryClient.forChain("arbitrum")).toThrow("Unsupported chain: arbitrum")
  })

  test("applies overrides over the chain's network constants", () => {
    const customRootRegistry = "0x0000000000000000000000000000000000000001"

    const client = RegistryClient.forChain("base", { rootRegistry: customRootRegistry })

    expect(client.getRootRegistryAddress()).toBe(customRootRegistry)
  })
})
