import { createRegistryClient, RegistryClient, RegistryRequestTimeoutError } from "../src"

const ROOT = "0x" + "12".repeat(32)
const PRIMARY = "https://primary-rpc.example.com"
const FALLBACK = "https://fallback-rpc.example.com"

const answer = () =>
  Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: ROOT })))
const hang = (_: string, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) =>
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
  )

const client = (fallbackRpcUrls: string[] = []) =>
  new RegistryClient({
    chainId: 31337,
    rpcUrl: PRIMARY,
    rootRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    registryHelper: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    retryCount: 3,
    rpcTimeoutMs: 50,
    fallbackRpcTimeoutMs: 50,
    fallbackRpcUrls,
  })

describe("RPC timeouts and fallbacks", () => {
  const originalFetch = globalThis.fetch
  let calls: string[]

  const mockFetch = (handler: (url: string, init?: RequestInit) => Promise<Response>) => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(input.toString())
      return handler(input.toString(), init)
    }) as typeof fetch
  }

  beforeEach(() => {
    calls = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("rejects a hung call with a timeout error instead of waiting forever", async () => {
    mockFetch(hang)

    const error = await client()
      .getLatestCertificateRoot()
      .catch((e) => e)

    expect(error).toBeInstanceOf(RegistryRequestTimeoutError)
    expect(calls).toEqual([PRIMARY])
  })

  it("moves to the fallback after one timeout, then keeps using it", async () => {
    mockFetch((url, init) => (url === PRIMARY ? hang(url, init) : answer()))
    const registry = client([FALLBACK])

    expect(await registry.getLatestCertificateRoot()).toBe(ROOT)
    expect(await registry.getLatestCircuitRoot()).toBe(ROOT)
    expect(calls).toEqual([PRIMARY, FALLBACK, FALLBACK])
  })

  it("moves to the fallback when the first URL answers with an error status", async () => {
    mockFetch((url) =>
      url === PRIMARY ? Promise.resolve(new Response("Forbidden", { status: 403 })) : answer(),
    )

    expect(await client([FALLBACK]).getLatestCertificateRoot()).toBe(ROOT)
  })

  it("falls back to ZKPassport's RPC route for a known chain", async () => {
    const route = "https://api.zkpassport.id/api/rpc/ethereum_sepolia"
    mockFetch((url, init) => (url === route ? answer() : hang(url, init)))

    const root = await createRegistryClient("ethereum_sepolia", {
      rpcTimeoutMs: 50,
    }).getLatestCertificateRoot()

    expect(root).toBe(ROOT)
    expect(calls[calls.length - 1]).toBe(route)
  })
})
