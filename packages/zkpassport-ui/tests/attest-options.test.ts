import { describe, expect, test } from "bun:test"
import { NullifierType, type AttestPolicy } from "@zkpassport/sdk"
import { buildAttestCardOptions, type AttestVerifyOptions } from "../src/attest-options"

const REGISTRY = "0x1111111111111111111111111111111111111111" as const
const WALLET = "0x2222222222222222222222222222222222222222" as const
const HOOK = "0x3333333333333333333333333333333333333333" as const
const POLICY_ID = 42n
const SCOPE = "attest:0x000000000000000000000000000000000000000000000000000000000000002a"
const DOMAIN = "policy.example"

const basePolicy: AttestPolicy = {
  owner: WALLET,
  validityPeriod: 2592000n,
  unique: true,
  saltedNullifierOnly: false,
  minAge: 0,
  sanctionsCheck: false,
  excludedCountries: [],
  metadataURL: "https://policy.example/kyc",
  hook: HOOK,
  retiredAt: 0n,
}

function stubChain(policy: AttestPolicy) {
  const readCalls: { functionName: string; args?: readonly unknown[] }[] = []
  const client = {
    readContract: async (params: never) => {
      const p = params as { functionName: string; args?: readonly unknown[] }
      readCalls.push(p)
      if (p.functionName === "getPolicy") return policy
      if (p.functionName === "policyScope") return SCOPE
      if (p.functionName === "domain") return DOMAIN
      throw new Error(`unexpected read ${p.functionName}`)
    },
    getLogs: async () => [],
  } as never
  return { client, readCalls }
}

function fakeQueryBuilder() {
  const calls: { method: string; args: unknown[] }[] = []
  const qb: Record<string, unknown> = {}
  for (const method of ["gte", "out", "sanctions", "facematch", "bind"]) {
    qb[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return qb
    }
  }
  qb.done = () => {
    calls.push({ method: "done", args: [] })
    return { url: "https://request.example" }
  }
  return { qb: qb as never, calls }
}

function baseOptions(policy: AttestPolicy): AttestVerifyOptions {
  return {
    client: stubChain(policy).client,
    registryAddress: REGISTRY,
    policyId: POLICY_ID,
    wallet: WALLET,
    chain: "ethereum_sepolia",
  }
}

describe("buildAttestCardOptions request props", () => {
  test("fetches policy, scope, and domain on-chain for an evm-mode request", async () => {
    const { client, readCalls } = stubChain(basePolicy)
    const options = await buildAttestCardOptions({ ...baseOptions(basePolicy), client })
    expect(options.scope).toBe(SCOPE)
    expect(options.domain).toBe(DOMAIN)
    expect(options.mode).toBe("compressed-evm")
    expect(options.devMode).toBe(false)
    expect(options.uniqueIdentifierType).toBe(NullifierType.NON_SALTED)
    expect(readCalls.map((c) => c.functionName).sort()).toEqual([
      "domain",
      "getPolicy",
      "policyScope",
    ])
  })

  test("unique salted policies request the salted unique identifier type", async () => {
    const policy = { ...basePolicy, saltedNullifierOnly: true }
    const options = await buildAttestCardOptions({
      ...baseOptions(policy),
      ...{ client: stubChain(policy).client },
    })
    expect(options.uniqueIdentifierType).toBe(NullifierType.SALTED)
  })

  test("non-unique policies leave the unique identifier type unconstrained", async () => {
    const policy = { ...basePolicy, unique: false, saltedNullifierOnly: true }
    const options = await buildAttestCardOptions({
      ...baseOptions(policy),
      ...{ client: stubChain(policy).client },
    })
    expect(options.uniqueIdentifierType).toBeUndefined()
  })

  test("supplying policy, scope, and domain skips all reads", async () => {
    const { client, readCalls } = stubChain(basePolicy)
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      client,
      policy: basePolicy,
      scope: SCOPE,
      domain: "custom.example",
    })
    expect(options.scope).toBe(SCOPE)
    expect(options.domain).toBe("custom.example")
    expect(readCalls.length).toBe(0)
  })

  test("each escape hatch skips only its own read", async () => {
    const { client, readCalls } = stubChain(basePolicy)
    await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      client,
      policy: basePolicy,
    })
    expect(readCalls.map((c) => c.functionName).sort()).toEqual(["domain", "policyScope"])
  })

  test("retired policies are rejected", async () => {
    const policy = { ...basePolicy, retiredAt: 1700000000n }
    await expect(
      buildAttestCardOptions({ ...baseOptions(policy), client: stubChain(policy).client }),
    ).rejects.toThrow("retired")
  })
})

describe("buildAttestCardOptions query translation", () => {
  async function queryCalls(policy: AttestPolicy) {
    const options = await buildAttestCardOptions({
      ...baseOptions(policy),
      client: stubChain(policy).client,
    })
    const { qb, calls } = fakeQueryBuilder()
    options.query(qb)
    return calls
  }

  test("bare policy: only binding, no predicates", async () => {
    const calls = await queryCalls(basePolicy)
    expect(calls).toEqual([
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })

  test("full policy: age, nationality exclusion, strict sanctions, then binding", async () => {
    const policy: AttestPolicy = {
      ...basePolicy,
      minAge: 21,
      // Stored sorted on-chain; contract-side ordering validation is a
      // registry follow-up, the query passes codes through as stored.
      excludedCountries: ["IRN", "PRK"],
      sanctionsCheck: true,
    }
    const calls = await queryCalls(policy)
    expect(calls).toEqual([
      { method: "gte", args: ["age", 21] },
      { method: "out", args: ["nationality", ["IRN", "PRK"]] },
      { method: "sanctions", args: ["all", "all", { strict: true }] },
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })

  test("unique salted policy adds strict facematch, required by the salted nullifier", async () => {
    const calls = await queryCalls({ ...basePolicy, saltedNullifierOnly: true })
    expect(calls).toEqual([
      { method: "facematch", args: ["strict"] },
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })

  test("non-unique salted policy needs no nullifier, so no facematch", async () => {
    const calls = await queryCalls({ ...basePolicy, unique: false, saltedNullifierOnly: true })
    expect(calls).toEqual([
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })
})

describe("enriched onResult", () => {
  const PARAMS = { version: "params-sentinel" } as never

  function fakeResponse(overrides: Record<string, unknown> = {}) {
    return {
      verified: true,
      uniqueIdentifier: "uid-1",
      uniqueIdentifierType: undefined,
      result: {},
      proofs: [{ proof: "0xdead", name: "outer_evm_5", version: "0.21.0" }],
      sdkInstance: {
        getSolidityVerifierParameters: (args: unknown) => {
          calls.push(args)
          return PARAMS
        },
      },
      ...overrides,
    } as never
  }

  let calls: unknown[] = []

  test("verified result carries a ready issue() call", async () => {
    calls = []
    const results: unknown[] = []
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      client: stubChain(basePolicy).client,
      onResult: (r) => results.push(r),
    })
    options.onResult!(fakeResponse())
    const r = results[0] as {
      verified: boolean
      issueCall?: { address: string; functionName: string; args: readonly unknown[] }
    }
    expect(r.verified).toBe(true)
    expect(r.issueCall?.address).toBe(REGISTRY)
    expect(r.issueCall?.functionName).toBe("issue")
    expect(r.issueCall?.args).toEqual([WALLET, POLICY_ID, PARAMS])
    expect(calls[0]).toEqual({
      proof: { proof: "0xdead", name: "outer_evm_5", version: "0.21.0" },
      scope: SCOPE,
      devMode: false,
    })
  })

  test("unverified result omits issueCall", async () => {
    const results: unknown[] = []
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      client: stubChain(basePolicy).client,
      onResult: (r) => results.push(r),
    })
    options.onResult!(fakeResponse({ verified: false }))
    expect((results[0] as { issueCall?: unknown }).issueCall).toBeUndefined()
  })

  test("dev-mode requests carry an issueCall with dev-mode verifier params", async () => {
    calls = []
    const errors: string[] = []
    const results: unknown[] = []
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      client: stubChain(basePolicy).client,
      devMode: true,
      onResult: (r) => results.push(r),
      onError: (message) => errors.push(message),
    })
    options.onResult!(fakeResponse())
    const r = results[0] as { issueCall?: { args: readonly unknown[] } }
    expect(r.issueCall?.args).toEqual([WALLET, POLICY_ID, PARAMS])
    expect(calls[0]).toEqual({
      proof: { proof: "0xdead", name: "outer_evm_5", version: "0.21.0" },
      scope: SCOPE,
      devMode: true,
    })
    expect(errors.length).toBe(0)
  })

  test("assembly failure omits issueCall and reports onError", async () => {
    const errors: string[] = []
    const results: unknown[] = []
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      client: stubChain(basePolicy).client,
      onResult: (r) => results.push(r),
      onError: (message) => errors.push(message),
    })
    options.onResult!(
      fakeResponse({
        sdkInstance: {
          getSolidityVerifierParameters: () => {
            throw new Error("no evm proof")
          },
        },
      }),
    )
    expect((results[0] as { issueCall?: unknown }).issueCall).toBeUndefined()
    expect(errors.length).toBe(1)
  })
})
