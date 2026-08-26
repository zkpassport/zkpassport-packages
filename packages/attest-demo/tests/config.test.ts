import { describe, expect, test } from "bun:test"
import { DemoConfigError, parseDemoConfig } from "../lib/config"

const REGISTRY = "0x1111111111111111111111111111111111111111"

describe("parseDemoConfig", () => {
  test("parses a complete config", () => {
    expect(
      parseDemoConfig({ chain: "ethereum_sepolia", registry: REGISTRY, popupUrl: "http://x:3000" }),
    ).toEqual({ chain: "ethereum_sepolia", registry: REGISTRY, popupUrl: "http://x:3000" })
  })

  test("defaults chain and popupUrl", () => {
    expect(parseDemoConfig({ registry: REGISTRY })).toEqual({
      chain: "ethereum_sepolia",
      registry: REGISTRY,
      popupUrl: "http://localhost:3000",
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

  test("strips a trailing slash from popupUrl", () => {
    expect(parseDemoConfig({ registry: REGISTRY, popupUrl: "http://x:3000/" }).popupUrl).toBe(
      "http://x:3000",
    )
  })
})
