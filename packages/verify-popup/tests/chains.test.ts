import { describe, expect, test } from "bun:test"
import { resolveAttestChain, rpcOverrideFromLocation } from "../src/chains"

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

  test("an RPC override keeps the chain's other endpoints", () => {
    const base = resolveAttestChain("local")
    const overridden = resolveAttestChain("local", "http://localhost:9999")
    expect(overridden.rpcUrls.default.webSocket).toEqual(base.rpcUrls.default.webSocket)
    expect(overridden.rpcUrls.default.webSocket?.length).toBeGreaterThan(0)
  })

  test("rpcOverrideFromLocation reads the rpc query param", () => {
    expect(rpcOverrideFromLocation("?rpc=http%3A%2F%2Flocalhost%3A8545&x=1")).toBe(
      "http://localhost:8545",
    )
    expect(rpcOverrideFromLocation("")).toBeUndefined()
    expect(rpcOverrideFromLocation("?x=1")).toBeUndefined()
  })

  test("rejects chains without a registry deployment", () => {
    expect(() => resolveAttestChain("base")).toThrow("not supported")
  })
})
