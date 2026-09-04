import { describe, expect, test } from "bun:test"
import { DemoConfigError, parseDemoConfig } from "../lib/config"

const REGISTRY = "0x1111111111111111111111111111111111111111"

describe("parseDemoConfig", () => {
  test("parses a complete config", () => {
    expect(
      parseDemoConfig({
        chain: "ethereum_sepolia",
        registry: REGISTRY,
        popupUrl: "http://x:3000",
        rpcUrl: "http://x:8545",
        deployBlock: "123",
      }),
    ).toEqual({
      chain: "ethereum_sepolia",
      registry: REGISTRY,
      popupUrl: "http://x:3000",
      rpcUrl: "http://x:8545",
      deployBlock: 123n,
    })
  })

  test("defaults chain and popupUrl", () => {
    expect(parseDemoConfig({ registry: REGISTRY })).toMatchObject({
      chain: "ethereum_sepolia",
      registry: REGISTRY,
      popupUrl: "http://localhost:3010",
    })
  })

  test("rejects a missing registry naming the variable", () => {
    expect(() => parseDemoConfig({})).toThrow(/NEXT_PUBLIC_REGISTRY_ADDRESS/)
    expect(() => parseDemoConfig({})).toThrow(DemoConfigError)
  })

  test("rejects a malformed registry", () => {
    expect(() => parseDemoConfig({ registry: "0x123" })).toThrow(/NEXT_PUBLIC_REGISTRY_ADDRESS/)
  })

  test("rejects an unsupported chain naming the variable", () => {
    expect(() => parseDemoConfig({ chain: "base", registry: REGISTRY })).toThrow(
      /NEXT_PUBLIC_CHAIN/,
    )
  })

  test("defaults rpcUrl to the public sepolia endpoint", () => {
    expect(parseDemoConfig({ registry: REGISTRY }).rpcUrl).toBe(
      "https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    )
  })

  test("accepts an rpcUrl override", () => {
    expect(parseDemoConfig({ registry: REGISTRY, rpcUrl: "http://localhost:8545" }).rpcUrl).toBe(
      "http://localhost:8545",
    )
  })

  test("defaults deployBlock to 0", () => {
    expect(parseDemoConfig({ registry: REGISTRY }).deployBlock).toBe(0n)
  })

  test("parses deployBlock", () => {
    expect(parseDemoConfig({ registry: REGISTRY, deployBlock: "11578281" }).deployBlock).toBe(
      11578281n,
    )
  })

  test("rejects a malformed deployBlock naming the variable", () => {
    expect(() => parseDemoConfig({ registry: REGISTRY, deployBlock: "latest" })).toThrow(
      /NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK/,
    )
  })

  test("strips a trailing slash from popupUrl", () => {
    expect(parseDemoConfig({ registry: REGISTRY, popupUrl: "http://x:3000/" }).popupUrl).toBe(
      "http://x:3000",
    )
  })
})
