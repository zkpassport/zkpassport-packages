/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZKPassport } from "../src/index"
import { MAX_SUPPORTED_CIRCUIT_VERSION } from "../src/constants"
import { isCircuitVersionSupported } from "../src/verifier-api"

describe("Verifier API fallback", () => {
  let originalFetch: typeof globalThis.fetch
  let originalWarn: typeof console.warn
  let fetchedUrls: string[]
  let fetchedBodies: string[]

  const newerCircuitProofs = [
    { proof: "0xdeadbeef", version: "9.9.9" as const, name: "outer_evm_5" },
  ]
  const originalQuery = { age: { gte: 18 } } as any
  const queryResult = { age: { gte: { expected: 18, result: true } } } as any

  beforeEach(() => {
    originalFetch = globalThis.fetch
    originalWarn = console.warn
    console.warn = () => {}
    fetchedUrls = []
    fetchedBodies = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchedUrls.push(input.toString())
      if (init?.body) fetchedBodies.push(init.body as string)
      return Response.json({ verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 })
    }) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
  })

  test("falls back only for circuit versions newer than the SDK supports", () => {
    expect(isCircuitVersionSupported(MAX_SUPPORTED_CIRCUIT_VERSION)).toBe(true)
    expect(isCircuitVersionSupported("0.19.4")).toBe(true)
    expect(isCircuitVersionSupported("0.20.1")).toBe(false)
    expect(isCircuitVersionSupported(undefined)).toBe(true)
  })

  test("verifies proofs from newer circuits through the verifier API", async () => {
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({
      proofs: newerCircuitProofs,
      originalQuery,
      queryResult,
      scope: "test-scope",
    })

    expect(result).toEqual({ verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 })
    expect(fetchedUrls).toEqual(["https://verifier.zkpassport.id/verify"])
    expect(JSON.parse(fetchedBodies[0])).toMatchObject({
      proofs: newerCircuitProofs,
      originalQuery,
      queryResult,
      serviceConfig: { domain: "example.com", scope: "test-scope", devMode: false },
    })
  })

  test("reports not verified rather than throwing when the verifier API fails", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down")
    }) as unknown as typeof globalThis.fetch
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs: newerCircuitProofs, originalQuery, queryResult })

    expect(result).toEqual({
      verified: false,
      uniqueIdentifier: undefined,
      uniqueIdentifierType: undefined,
    })
  })
})
