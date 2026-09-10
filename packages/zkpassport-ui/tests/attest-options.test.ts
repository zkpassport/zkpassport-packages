import { describe, expect, spyOn, test } from "bun:test"
import {
  AttestClient,
  NullifierType,
  type AttestPolicy,
  type AttestPolicyRequirements,
} from "@zkpassport/sdk"
import { buildAttestCardOptions, type AttestVerifyOptions } from "../src/attest-options"

const REGISTRY = "0x1111111111111111111111111111111111111111" as const
const WALLET = "0x2222222222222222222222222222222222222222" as const
const POLICY_ID = 42n
const SCOPE = "attest:0x000000000000000000000000000000000000000000000000000000000000002a"
const DOMAIN = "policy.example"

const EVALUATOR = "0x3333333333333333333333333333333333333333" as const

const basePolicy: AttestPolicy = {
  owner: WALLET,
  credentialDuration: 2592000n,
  ownerIssuable: false,
  ownerRevocable: false,
  evaluator: EVALUATOR,
  requirements: "0xabcd",
  metadataURL: "https://policy.example/kyc",
  retiredAt: 0n,
}

/**
 * decodeRequirements as the contract returns it: raw enum numbers. uniqueIdentifierType uses
 * the shared NullifierType numbering (0 non-salted, 1 salted, 2-3 mock twins, 4 none).
 */
type RawRequirements = Omit<
  AttestPolicyRequirements,
  "uniqueIdentifierType" | "sanctionsMode" | "facematchMode"
> & {
  uniqueIdentifierType: number
  sanctionsMode: number
  faceMatchMode: number
}

const POLICY_NON_SALTED = 0
const POLICY_SALTED = 1
const POLICY_SALTED_MOCK = 3
const POLICY_NONE = 4

const baseRequirements: RawRequirements = {
  uniqueIdentifierType: POLICY_NON_SALTED,
  enforceUniqueness: true,
  minAge: 0,
  sanctionsMode: 0,
  faceMatchMode: 0,
  includedNationalities: [],
  excludedNationalities: [],
}

function stubChain(policy: AttestPolicy, requirements: RawRequirements = baseRequirements) {
  const readCalls: { functionName: string; args?: readonly unknown[] }[] = []
  const client = {
    readContract: async (params: never) => {
      const p = params as { functionName: string; args?: readonly unknown[] }
      readCalls.push(p)
      if (p.functionName === "getPolicy") return policy
      if (p.functionName === "policyScope") return SCOPE
      if (p.functionName === "domain") return DOMAIN
      if (p.functionName === "schemaVersion") return 1n
      if (p.functionName === "decodeRequirements") return requirements
      throw new Error(`unexpected read ${p.functionName}`)
    },
    getLogs: async () => [],
  } as never
  return { client, readCalls }
}

function fakeQueryBuilder() {
  const calls: { method: string; args: unknown[] }[] = []
  const qb: Record<string, unknown> = {}
  for (const method of ["gte", "lte", "range", "in", "out", "sanctions", "facematch", "bind"]) {
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
      "decodeRequirements",
      "domain",
      "getPolicy",
      "policyScope",
      "schemaVersion",
    ])
  })

  test("salted policies request the salted unique identifier type", async () => {
    const salted: RawRequirements = {
      ...baseRequirements,
      uniqueIdentifierType: POLICY_SALTED,
    }
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      ...{ client: stubChain(basePolicy, salted).client },
    })
    expect(options.uniqueIdentifierType).toBe(NullifierType.SALTED)
  })

  test("mock-type policies request the real twin, which dev mode answers with the mock type", async () => {
    const mockSalted: RawRequirements = {
      ...baseRequirements,
      uniqueIdentifierType: POLICY_SALTED_MOCK,
    }
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      ...{ client: stubChain(basePolicy, mockSalted).client },
    })
    expect(options.uniqueIdentifierType).toBe(NullifierType.SALTED)
  })

  test("policies without dedup leave the unique identifier type unconstrained", async () => {
    const none: RawRequirements = {
      ...baseRequirements,
      uniqueIdentifierType: POLICY_NONE,
    }
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      ...{ client: stubChain(basePolicy, none).client },
    })
    expect(options.uniqueIdentifierType).toBeUndefined()
  })

  test("retired policies are rejected", async () => {
    const policy = { ...basePolicy, retiredAt: 1700000000n }
    await expect(
      buildAttestCardOptions({ ...baseOptions(policy), client: stubChain(policy).client }),
    ).rejects.toThrow("retired")
  })
})

describe("buildAttestCardOptions query translation", () => {
  async function queryCalls(requirements: RawRequirements) {
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      client: stubChain(basePolicy, requirements).client,
    })
    const { qb, calls } = fakeQueryBuilder()
    options.query(qb)
    return calls
  }

  test("bare policy: only binding, no predicates", async () => {
    const calls = await queryCalls(baseRequirements)
    expect(calls).toEqual([
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })

  test("full policy: age, nationality exclusion, strict sanctions, then binding", async () => {
    const requirements: RawRequirements = {
      ...baseRequirements,
      minAge: 21,
      // Stored sorted on-chain (createPolicy validates order); the query
      // passes codes through as stored.
      excludedNationalities: ["IRN", "PRK"],
      sanctionsMode: 2,
    }
    const calls = await queryCalls(requirements)
    expect(calls).toEqual([
      { method: "gte", args: ["age", 21] },
      { method: "out", args: ["nationality", ["IRN", "PRK"]] },
      { method: "sanctions", args: ["all", "all", { strict: true }] },
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })

  test("nationality allowlist, normal sanctions, and facematch map through", async () => {
    const requirements: RawRequirements = {
      ...baseRequirements,
      includedNationalities: ["ARG", "FRA"],
      sanctionsMode: 1,
      faceMatchMode: 1,
    }
    const calls = await queryCalls(requirements)
    expect(calls).toEqual([
      { method: "in", args: ["nationality", ["ARG", "FRA"]] },
      { method: "sanctions", args: ["all", "all", { strict: false }] },
      { method: "facematch", args: ["regular"] },
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })

  test("salted policy adds strict facematch, required by the salted nullifier", async () => {
    for (const salted of [POLICY_SALTED, POLICY_SALTED_MOCK]) {
      const calls = await queryCalls({
        ...baseRequirements,
        uniqueIdentifierType: salted,
      })
      expect(calls).toEqual([
        { method: "facematch", args: ["strict"] },
        { method: "bind", args: ["user_address", WALLET] },
        { method: "bind", args: ["chain", "ethereum_sepolia"] },
        { method: "done", args: [] },
      ])
    }
  })

  test("policy without dedup needs no nullifier, so no facematch", async () => {
    const calls = await queryCalls({
      ...baseRequirements,
      uniqueIdentifierType: POLICY_NONE,
    })
    expect(calls).toEqual([
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })
})

describe("enriched onResult", () => {
  const PROOF_DATA = "0xf00fda7a" as const

  function fakeResponse(overrides: Record<string, unknown> = {}) {
    return {
      verified: true,
      uniqueIdentifier: "uid-1",
      uniqueIdentifierType: undefined,
      result: {},
      proofs: [{ proof: "0xdead", name: "outer_evm_5", version: "0.21.0" }],
      ...overrides,
    } as never
  }

  function withProofDataStub(
    impl: (options: unknown) => `0x${string}`,
    run: () => Promise<void>,
  ): Promise<void> {
    const spy = spyOn(AttestClient, "getIssueProofData").mockImplementation(impl as never)
    return run().finally(() => spy.mockRestore())
  }

  test("verified result carries a ready issue() call", async () => {
    const calls: unknown[] = []
    await withProofDataStub(
      (options) => {
        calls.push(options)
        return PROOF_DATA
      },
      async () => {
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
        expect(r.issueCall?.args).toEqual([POLICY_ID, PROOF_DATA])
        expect(calls[0]).toEqual({
          proof: { proof: "0xdead", name: "outer_evm_5", version: "0.21.0" },
          domain: DOMAIN,
          scope: SCOPE,
          devMode: false,
        })
      },
    )
  })

  test("unverified result omits issueCall", async () => {
    await withProofDataStub(
      () => PROOF_DATA,
      async () => {
        const results: unknown[] = []
        const options = await buildAttestCardOptions({
          ...baseOptions(basePolicy),
          client: stubChain(basePolicy).client,
          onResult: (r) => results.push(r),
        })
        options.onResult!(fakeResponse({ verified: false }))
        expect((results[0] as { issueCall?: unknown }).issueCall).toBeUndefined()
      },
    )
  })

  test("dev-mode requests carry an issueCall with dev-mode proof data", async () => {
    const calls: unknown[] = []
    await withProofDataStub(
      (options) => {
        calls.push(options)
        return PROOF_DATA
      },
      async () => {
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
        expect(r.issueCall?.args).toEqual([POLICY_ID, PROOF_DATA])
        expect(calls[0]).toEqual({
          proof: { proof: "0xdead", name: "outer_evm_5", version: "0.21.0" },
          domain: DOMAIN,
          scope: SCOPE,
          devMode: true,
        })
        expect(errors.length).toBe(0)
      },
    )
  })

  test("assembly failure omits issueCall and reports onError", async () => {
    await withProofDataStub(
      () => {
        throw new Error("no evm proof")
      },
      async () => {
        const errors: string[] = []
        const results: unknown[] = []
        const options = await buildAttestCardOptions({
          ...baseOptions(basePolicy),
          client: stubChain(basePolicy).client,
          onResult: (r) => results.push(r),
          onError: (message) => errors.push(message),
        })
        options.onResult!(fakeResponse())
        expect((results[0] as { issueCall?: unknown }).issueCall).toBeUndefined()
        expect(errors.length).toBe(1)
      },
    )
  })
})
