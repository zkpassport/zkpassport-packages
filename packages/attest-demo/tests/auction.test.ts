import { describe, expect, test } from "bun:test"
import type { PublicClient } from "viem"
import { introspectAuction, mockAuctionArtifact, submitBidRequest } from "../lib/auction"

const REGISTRY = "0x2222222222222222222222222222222222222222" as const
const AUCTION = "0x5555555555555555555555555555555555555555" as const
const HOOK = "0x4444444444444444444444444444444444444444" as const
const WALLET = "0x3333333333333333333333333333333333333333" as const

function stubPublicClient(routes: Record<string, unknown>): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName in routes) return routes[functionName]
      throw new Error(`unexpected read: ${functionName}`)
    },
  } as unknown as PublicClient
}

describe("mockAuctionArtifact", () => {
  test("exposes the generated abi and bytecode", () => {
    const artifact = mockAuctionArtifact()
    expect(artifact.bytecode.startsWith("0x")).toBe(true)
    expect(JSON.stringify(artifact.abi)).toContain("submitBid")
  })
})

describe("introspectAuction", () => {
  test("resolves hook and policyId for a matching registry", async () => {
    const client = stubPublicClient({ validationHook: HOOK, erc1155: REGISTRY, tokenId: 42n })
    expect(await introspectAuction(client, REGISTRY, AUCTION)).toEqual({
      hook: HOOK,
      policyId: 42n,
    })
  })

  test("returns null when the hook belongs to another registry", async () => {
    const client = stubPublicClient({
      validationHook: HOOK,
      erc1155: "0x9999999999999999999999999999999999999999",
      tokenId: 42n,
    })
    expect(await introspectAuction(client, REGISTRY, AUCTION)).toBeNull()
  })

  test("returns null when reads revert", async () => {
    const client = stubPublicClient({})
    expect(await introspectAuction(client, REGISTRY, AUCTION)).toBeNull()
  })
})

describe("submitBidRequest", () => {
  test("carries the exact args tuple", () => {
    const request = submitBidRequest(AUCTION, { maxPrice: 100n, amount: 5n, owner: WALLET })
    expect(request.address).toBe(AUCTION)
    expect(request.functionName).toBe("submitBid")
    expect(request.args).toEqual([100n, 5n, WALLET, "0x"])
  })
})
