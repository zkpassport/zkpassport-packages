import { describe, expect, test } from "bun:test"
import { getRegistryClientOptions } from "./index"

describe("getRegistryClientOptions", () => {
  test("passes the RPC override through untouched", () => {
    expect(getRegistryClientOptions({ rpcUrl: "https://rpc" })).toEqual({ rpcUrl: "https://rpc" })
    expect(getRegistryClientOptions(undefined)).toEqual({})
  })

  test("points the manifest and circuit fetches at a local circuits server", () => {
    const options = getRegistryClientOptions({ circuitsUrl: "http://192.168.0.155:8000/" })

    expect(options.circuitManifestUrlGenerator!(1, { version: "0.21.0" })).toBe(
      "http://192.168.0.155:8000/by-version/0.21.0/manifest.json",
    )
    expect(options.circuitManifestUrlGenerator!(1, { root: "0xabc" })).toBe(
      "http://192.168.0.155:8000/by-root/0xabc/manifest.json",
    )
    expect(options.packagedCircuitUrlGenerator!(1, "0x2e36")).toBe(
      "http://192.168.0.155:8000/by-hash/0x2e36.json",
    )
    expect(options).not.toHaveProperty("circuitsUrl")
  })
})
