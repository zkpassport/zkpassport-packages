import { describe, expect, test } from "bun:test"
import {
  configuredRpcUrl,
  resolveCredentialsChain,
  rpcOverrideFromLocation,
} from "../src/mint/wagmi"

describe("resolveCredentialsChain", () => {
  test("resolves a supported chain", () => {
    expect(resolveCredentialsChain("ethereum_sepolia").id).toBe(11155111)
    expect(resolveCredentialsChain("local").id).toBe(31337)
  })

  test("applies an RPC override without mutating the base chain", () => {
    const overridden = resolveCredentialsChain("ethereum_sepolia", "http://localhost:8545")
    expect(overridden.rpcUrls.default.http).toEqual(["http://localhost:8545"])
    expect(resolveCredentialsChain("ethereum_sepolia").rpcUrls.default.http).not.toEqual([
      "http://localhost:8545",
    ])
  })

  test("rpcOverrideFromLocation reads the rpc query param on localhost only", () => {
    const search = "?rpc=http%3A%2F%2Flocalhost%3A8545&x=1"
    expect(rpcOverrideFromLocation({ hostname: "localhost", search })).toBe("http://localhost:8545")
    expect(rpcOverrideFromLocation({ hostname: "localhost", search: "?x=1" })).toBeUndefined()
    expect(rpcOverrideFromLocation({ hostname: "verify.zkpassport.id", search })).toBeUndefined()
  })

  test("configuredRpcUrl reads the chain's env var and ignores empty values", () => {
    const env = {
      VITE_RPC_URL_ETHEREUM_SEPOLIA: "https://rpc.example/sepolia",
      VITE_RPC_URL_ETHEREUM: "",
    }
    expect(configuredRpcUrl("ethereum_sepolia", env)).toBe("https://rpc.example/sepolia")
    // Empty is treated as unset, so it falls through rather than overriding
    expect(configuredRpcUrl("ethereum", env)).toStartWith("https://eth-mainnet.")
  })

  test("falls back to the registry's configured RPC when no env var is set", () => {
    const url = configuredRpcUrl("ethereum", {})
    expect(url).toStartWith("https://eth-mainnet.")
    expect(configuredRpcUrl("ethereum_sepolia", {})).toStartWith("https://eth-sepolia.")
  })

  test("an env var still wins over the registry default", () => {
    const env = { VITE_RPC_URL_ETHEREUM: "https://rpc.example/mainnet" }
    expect(configuredRpcUrl("ethereum", env)).toBe("https://rpc.example/mainnet")
  })

  test("rejects chains without a registry deployment", () => {
    expect(() => resolveCredentialsChain("base")).toThrow("not supported")
  })
})
