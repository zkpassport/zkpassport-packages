import { describe, expect, test } from "bun:test"
import { resolveAttestChain } from "../src/chains"

describe("resolveAttestChain", () => {
  test("resolves a supported chain", () => {
    expect(resolveAttestChain("ethereum_sepolia").id).toBe(11155111)
    expect(resolveAttestChain("local").id).toBe(31337)
  })

  test("applies an RPC override without mutating the base chain", () => {
    const overridden = resolveAttestChain("ethereum_sepolia", "http://localhost:8545")
    expect(overridden.rpcUrls.default.http).toEqual(["http://localhost:8545"])
    expect(resolveAttestChain("ethereum_sepolia").rpcUrls.default.http).not.toEqual([
      "http://localhost:8545",
    ])
  })

  test("rejects chains without a registry deployment", () => {
    expect(() => resolveAttestChain("base")).toThrow("not supported")
  })
})
