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

describe("getSanctionsTree", () => {
  test("downloads from the CDN of the chain's network type", async () => {
    const root = `0x${"0c".repeat(32)}`
    const fetchedUrls: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchedUrls.push(input.toString())
      return Response.json([[root]])
    }) as typeof globalThis.fetch

    try {
      for (const chain of [
        "ethereum",
        "base",
        "robinhood",
        "aztec",
        "ethereum_sepolia",
        "aztec_testnet",
      ] as const) {
        await createRegistryClient(chain).getSanctionsTree(root)
      }
    } finally {
      globalThis.fetch = originalFetch
    }

    const mainnetUrl = `https://sanctions.zkpassport.id/mainnet/${root}.tree.json.gz`
    const testnetUrl = `https://sanctions.zkpassport.id/testnet/${root}.tree.json.gz`
    expect(fetchedUrls).toEqual([
      mainnetUrl,
      mainnetUrl,
      mainnetUrl,
      mainnetUrl,
      testnetUrl,
      testnetUrl,
    ])
  })
})
