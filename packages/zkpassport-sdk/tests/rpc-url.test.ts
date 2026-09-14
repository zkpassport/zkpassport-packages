/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { RegistryClient } from "@zkpassport/registry"
import { ZKPassport } from "../src/index"

describe("ZKPassport rpcUrl argument", () => {
  let originalFetch: typeof globalThis.fetch
  let requests: { url: string; body: any }[]

  beforeEach(() => {
    originalFetch = globalThis.fetch
    requests = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: input.toString(), body: JSON.parse(init?.body as string) })
      // eth_call returning true
      return Response.json({ jsonrpc: "2.0", id: 1, result: "0x" + "1".padStart(64, "0") })
    }) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("root checks go through the supplied RPC URL", async () => {
    const zk = new ZKPassport("example.com", "http://rpc.test")
    const client: RegistryClient = (zk as any).createRegistryClient(false)

    const valid = await client.isCertificateRootValid("ab")

    expect(valid).toBe(true)
    expect(requests.map((r) => r.url)).toEqual(["http://rpc.test"])
    expect(requests[0].body.method).toBe("eth_call")
  })

  test("devMode keeps the supplied RPC URL and targets the Sepolia registry", async () => {
    const zk = new ZKPassport("example.com", "http://rpc.test")
    const client: RegistryClient = (zk as any).createRegistryClient(true)

    await client.isCircuitRootValid("ab")

    // Same contract address the registry package uses for Sepolia
    await new RegistryClient({
      chainId: 11155111,
      rpcUrl: "http://sepolia.test",
    }).isCircuitRootValid("ab")

    expect(requests.map((r) => r.url)).toEqual(["http://rpc.test", "http://sepolia.test"])
    expect(requests[0].body.params[0].to).toBe(requests[1].body.params[0].to)
  })

  test("uses the registry package's default RPC URL when none is passed", async () => {
    const zk = new ZKPassport("example.com")
    const client: RegistryClient = (zk as any).createRegistryClient(false)

    await client.isCertificateRootValid("ab")

    // Whatever the registry package would request on its own for mainnet
    await new RegistryClient({ chainId: 1 }).isCertificateRootValid("ab")

    expect(requests).toHaveLength(2)
    expect(requests[0].url).toBe(requests[1].url)
    expect(requests[0].body.params[0].to).toBe(requests[1].body.params[0].to)
  })
})
