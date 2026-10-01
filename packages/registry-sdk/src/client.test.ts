import { describe, expect, test } from "bun:test"
import { createRegistryClient } from "./client"

describe("createRegistryClient", () => {
  test("throws for a chain RegistryClient does not support", () => {
    expect(() => createRegistryClient("arbitrum")).toThrow("Unsupported chain: arbitrum")
  })

  test("applies overrides over the chain's network constants", () => {
    const customRootRegistry = "0x0000000000000000000000000000000000000001"

    const client = createRegistryClient("base", { rootRegistry: customRootRegistry })

    expect(client.getRootRegistryAddress()).toBe(customRootRegistry)
  })
})
