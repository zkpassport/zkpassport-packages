/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { NullifierType, ZKPassport } from "../src/index"

describe("verify() modes and the verifier API", () => {
  let originalFetch: typeof globalThis.fetch
  let originalWarn: typeof console.warn
  let warnings: string[]
  let fetchedUrls: string[]
  let fetchedBodies: string[]
  let localSpy: ReturnType<typeof spyOn>

  const proofs = [
    {
      proof: "0xdeadbeef",
      version: "0.21.0" as const,
      name: "outer_evm_5",
    },
  ]
  const originalQuery = { age: { gte: 18 } } as any
  const queryResult = { age: { gte: { expected: 18, result: true } } } as any
  const notVerified = {
    verified: false,
    uniqueIdentifier: undefined,
    uniqueIdentifierType: undefined,
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch
    originalWarn = console.warn
    warnings = []
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "))
    }
    fetchedUrls = []
    fetchedBodies = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchedUrls.push(input.toString())
      if (init?.body) fetchedBodies.push(init.body as string)
      return Response.json({ verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 })
    }) as unknown as typeof globalThis.fetch
    localSpy = spyOn(ZKPassport.prototype as any, "verifyLocally")
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    localSpy.mockRestore()
  })

  test("rejects invalid parameters before verifying", async () => {
    const zk = new ZKPassport("example.com")

    await expect(zk.verify({ proofs, originalQuery } as any)).rejects.toThrow("queryResult")
    expect(localSpy).not.toHaveBeenCalled()
  })

  test("auto keeps a verified local result without calling the API", async () => {
    const localResult = { verified: true, uniqueIdentifier: "local-uid", uniqueIdentifierType: 1 }
    localSpy.mockResolvedValue(localResult)
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult })

    expect(result).toEqual(localResult as any)
    expect(fetchedUrls).toEqual([])
  })

  test("auto defers to the verifier API when local verification throws", async () => {
    localSpy.mockRejectedValue(new Error("bb cannot deserialize this proof"))
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult, scope: "test-scope" })

    expect(result).toEqual({ verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 })
    expect(fetchedUrls).toEqual(["https://verifier.zkpassport.id/verify"])
    expect(JSON.parse(fetchedBodies[0])).toMatchObject({
      proofs,
      originalQuery,
      queryResult,
      serviceConfig: { domain: "example.com", scope: "test-scope", devMode: false },
    })
  })

  test("auto defers to the verifier API when the local result is not verified", async () => {
    localSpy.mockResolvedValue(notVerified)
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult })

    expect(result).toEqual({ verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 })
    expect(fetchedUrls).toEqual(["https://verifier.zkpassport.id/verify"])
  })

  test("auto keeps the local result when the API gives no verdict", async () => {
    const localResult = { ...notVerified, queryResultErrors: { age: { gte: { message: "no" } } } }
    localSpy.mockResolvedValue(localResult)
    globalThis.fetch = (async () => {
      return Response.json({ verified: false, error: "not supported yet" }, { status: 501 })
    }) as unknown as typeof globalThis.fetch
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult })

    expect(result).toEqual(localResult as any)
  })

  test("local never calls the API", async () => {
    localSpy.mockResolvedValue(notVerified)
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult, verifierMode: "local" })

    expect(result).toEqual(notVerified)
    expect(fetchedUrls).toEqual([])
  })

  test("api never verifies locally and reports the API verdict", async () => {
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult, verifierMode: "api" })

    expect(result).toEqual({ verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 })
    expect(localSpy).not.toHaveBeenCalled()
    expect(fetchedUrls).toEqual(["https://verifier.zkpassport.id/verify"])
  })

  test("api reports not verified when the API is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down")
    }) as unknown as typeof globalThis.fetch
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult, verifierMode: "api" })

    expect(result).toEqual(notVerified)
    expect(localSpy).not.toHaveBeenCalled()
  })

  test("rejects proofs whose unique identifier type is not the requested one", async () => {
    localSpy.mockResolvedValue({
      verified: true,
      uniqueIdentifier: "local-uid",
      uniqueIdentifierType: NullifierType.NON_SALTED,
    })
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({
      proofs,
      originalQuery,
      queryResult,
      uniqueIdentifierType: NullifierType.SALTED,
    })

    expect(result).toEqual(notVerified)
    expect(warnings).toEqual(["Unique identifier type mismatch: requested SALTED, got NON_SALTED"])
  })

  test("accepts a mock unique identifier type for the requested real one", async () => {
    const localResult = {
      verified: true,
      uniqueIdentifier: "local-uid",
      uniqueIdentifierType: NullifierType.SALTED_MOCK,
    }
    localSpy.mockResolvedValue(localResult)
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({
      proofs,
      originalQuery,
      queryResult,
      devMode: true,
      uniqueIdentifierType: NullifierType.SALTED,
    })

    expect(result).toEqual(localResult as any)
  })

  test("ignores a null unique identifier type from untyped callers", async () => {
    const localResult = {
      verified: true,
      uniqueIdentifier: "local-uid",
      uniqueIdentifierType: NullifierType.NON_SALTED,
    }
    localSpy.mockResolvedValue(localResult)
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({
      proofs,
      originalQuery,
      queryResult,
      uniqueIdentifierType: null as any,
    })

    expect(result).toEqual(localResult as any)
  })

  test("an oprf key requires a salted unique identifier", async () => {
    localSpy.mockResolvedValue({
      verified: true,
      uniqueIdentifier: "local-uid",
      uniqueIdentifierType: NullifierType.NON_SALTED,
    })
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult, oprfKeyId: "key-1" })

    expect(result).toEqual(notVerified)
    expect(warnings).toEqual(["Unique identifier type mismatch: requested SALTED, got NON_SALTED"])
  })

  test("enforces the requested unique identifier type on the API verdict", async () => {
    globalThis.fetch = (async () => {
      return Response.json({
        verified: true,
        uniqueIdentifier: "uid-1",
        uniqueIdentifierType: NullifierType.NON_SALTED,
      })
    }) as unknown as typeof globalThis.fetch
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({
      proofs,
      originalQuery,
      queryResult,
      verifierMode: "api",
      uniqueIdentifierType: NullifierType.NONE,
    })

    expect(result).toEqual(notVerified)
    expect(warnings).toEqual(["Unique identifier type mismatch: requested NONE, got NON_SALTED"])
  })

  test("api returns the API's queryResultErrors when it rejects the proofs", async () => {
    const queryResultErrors = { age: { gte: { message: "age check failed" } } }
    globalThis.fetch = (async () => {
      return Response.json(
        { verified: false, error: "proof invalid", queryResultErrors },
        { status: 400 },
      )
    }) as unknown as typeof globalThis.fetch
    const zk = new ZKPassport("example.com")

    const result = await zk.verify({ proofs, originalQuery, queryResult, verifierMode: "api" })

    expect(result).toEqual({ ...notVerified, queryResultErrors } as any)
  })
})
