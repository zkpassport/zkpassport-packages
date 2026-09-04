import { describe, expect, test } from "bun:test"
import { isPopupChain, resolveChain } from "../lib/chains"

describe("isPopupChain", () => {
  test("accepts the demo chains", () => {
    expect(isPopupChain("ethereum_sepolia")).toBe(true)
    expect(isPopupChain("local")).toBe(true)
  })

  test("rejects unmapped SupportedChain values and garbage", () => {
    expect(isPopupChain("base")).toBe(false)
    expect(isPopupChain("")).toBe(false)
    expect(isPopupChain("mainnet")).toBe(false)
  })
})

describe("resolveChain", () => {
  test("maps popup chains to the right chain ids", () => {
    expect(resolveChain("ethereum_sepolia").id).toBe(11155111)
    expect(resolveChain("local").id).toBe(31337)
  })

  test("applies an rpc override without changing identity", () => {
    const chain = resolveChain("local", "http://10.0.0.5:8545")
    expect(chain.id).toBe(31337)
    expect(chain.rpcUrls.default.http[0]).toBe("http://10.0.0.5:8545")
  })

  test("keeps the chain default rpc without an override", () => {
    expect(resolveChain("local").rpcUrls.default.http[0]).toContain("8545")
  })
})
