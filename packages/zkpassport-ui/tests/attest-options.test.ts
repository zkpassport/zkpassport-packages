import { describe, expect, test } from "bun:test"
import type { AttestPolicy } from "@zkpassport/sdk"
import { buildAttestCardOptions, type AttestVerifyOptions } from "../src/attest-options"

const REGISTRY = "0x1111111111111111111111111111111111111111" as const
const WALLET = "0x2222222222222222222222222222222222222222" as const
const HOOK = "0x3333333333333333333333333333333333333333" as const
const POLICY_ID = 42n
const SCOPE = "attest:0x000000000000000000000000000000000000000000000000000000000000002a"

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

export function stubChain(policy: AttestPolicy) {
  const readCalls: { functionName: string; args?: readonly unknown[] }[] = []
  const client = {
    readContract: async (params: never) => {
      const p = params as { functionName: string; args?: readonly unknown[] }
      readCalls.push(p)
      if (p.functionName === "getPolicy") return policy
      if (p.functionName === "policyScope") return SCOPE
      throw new Error(`unexpected read ${p.functionName}`)
    },
    getLogs: async () => [],
  } as never
  return { client, readCalls }
}

export function fakeQueryBuilder() {
  const calls: { method: string; args: unknown[] }[] = []
  const qb: Record<string, unknown> = {}
  for (const method of ["gte", "out", "sanctions", "bind"]) {
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

export function baseOptions(policy: AttestPolicy): AttestVerifyOptions {
  return {
    client: stubChain(policy).client,
    registryAddress: REGISTRY,
    policyId: POLICY_ID,
    wallet: WALLET,
    chain: "ethereum_sepolia",
  }
}

describe("buildAttestCardOptions request props", () => {
  test("fetches scope on-chain and configures an evm-mode request", async () => {
    const { client, readCalls } = stubChain(basePolicy)
    const options = await buildAttestCardOptions({ ...baseOptions(basePolicy), client })
    expect(options.scope).toBe(SCOPE)
    expect(options.mode).toBe("compressed-evm")
    expect(options.devMode).toBe(false)
    expect("uniqueIdentifierType" in options).toBe(false)
    expect(readCalls.map((c) => c.functionName).sort()).toEqual(["getPolicy", "policyScope"])
  })

  test("salted policies request the salted unique identifier type", async () => {
    const policy = { ...basePolicy, saltedNullifierOnly: true }
    const options = await buildAttestCardOptions({
      ...baseOptions(policy),
      ...{ client: stubChain(policy).client },
    })
    expect(options.uniqueIdentifierType).toBeDefined()
  })

  test("supplying policy and scope skips all reads", async () => {
    const { client, readCalls } = stubChain(basePolicy)
    const options = await buildAttestCardOptions({
      ...baseOptions(basePolicy),
      client,
      policy: basePolicy,
      scope: SCOPE,
    })
    expect(options.scope).toBe(SCOPE)
    expect(readCalls.length).toBe(0)
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

  test("full policy: age, nationality exclusion, sanctions, then binding", async () => {
    const policy: AttestPolicy = {
      ...basePolicy,
      minAge: 21,
      excludedCountries: ["PRK", "IRN"],
      sanctionsCheck: true,
    }
    const calls = await queryCalls(policy)
    expect(calls).toEqual([
      { method: "gte", args: ["age", 21] },
      { method: "out", args: ["nationality", ["PRK", "IRN"]] },
      { method: "sanctions", args: [] },
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })
})
