/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZKPassport } from "../src/index"
import { canVerifyLocally } from "../src/verifier-api"

describe("Verifier API fallback", () => {
  let originalFetch: typeof globalThis.fetch
  let originalWarn: typeof console.warn
  let fetchedUrls: string[]
  let fetchedBodies: string[]

  const newerBBProofs = [
    {
      proof: "0xdeadbeef",
      version: "0.21.0" as const,
      bbVersion: "6.0.0",
      name: "outer_evm_5",
    },
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

  test("verifies locally for supported bb versions, including proofs without one", () => {
    expect(canVerifyLocally({ bbVersion: "4.0.0" })).toBe(true)
    expect(canVerifyLocally({ bbVersion: "5.2.1" })).toBe(true)
    expect(canVerifyLocally({ bbVersion: "6.0.0" })).toBe(false)
    expect(canVerifyLocally({})).toBe(true)
  })

  test("verifies proofs from newer bb versions through the verifier API", async () => {
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({
      proofs: newerBBProofs,
      originalQuery,
      queryResult,
      scope: "test-scope",
    })

    expect(result).toEqual({ verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 })
    expect(fetchedUrls).toEqual(["https://verifier.zkpassport.id/verify"])
    expect(JSON.parse(fetchedBodies[0])).toMatchObject({
      proofs: newerBBProofs,
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

    const result = await zk.verify({ proofs: newerBBProofs, originalQuery, queryResult })

    expect(result).toEqual({
      verified: false,
      uniqueIdentifier: undefined,
      uniqueIdentifierType: undefined,
    })
  })
})
