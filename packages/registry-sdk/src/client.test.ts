import { getIdFromChain } from "@zkpassport/utils"
import { describe, expect, test } from "bun:test"
import { createRegistryClient } from "./client"

describe("createRegistryClient", () => {
  test("throws for a chain RegistryClient does not support", () => {
    const arbitrumChainId = getIdFromChain("arbitrum")

    expect(() => createRegistryClient("arbitrum")).toThrow("Unsupported chain: arbitrum")
    expect(() => createRegistryClient(arbitrumChainId)).toThrow(
      `Unsupported chain: ${arbitrumChainId}`,
    )
  })

  test("applies overrides over the chain's network constants", () => {
    const customRootRegistry = "0x0000000000000000000000000000000000000001"

    const clientByName = createRegistryClient("base", { rootRegistry: customRootRegistry })
    const clientById = createRegistryClient(getIdFromChain("base"), {
      rootRegistry: customRootRegistry,
    })

    expect(clientByName.getRootRegistryAddress()).toBe(customRootRegistry)
    expect(clientById.getRootRegistryAddress()).toBe(customRootRegistry)
  })
})
