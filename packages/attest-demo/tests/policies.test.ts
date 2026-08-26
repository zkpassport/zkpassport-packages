import { describe, expect, test } from "bun:test"
import { AttestClient } from "@zkpassport/sdk"
import type { PublicClient } from "viem"
import {
  createAttestContext,
  createPolicyRequest,
  guardianOf,
  listPoliciesWithDetails,
  randomSalt,
  retireRequest,
  revokeRequest,
  type AttestContext,
} from "../lib/policies"
import { resolveChain } from "../lib/chains"

const REGISTRY = "0x2222222222222222222222222222222222222222" as const
const WALLET = "0x3333333333333333333333333333333333333333" as const
const SALT = `0x${"11".repeat(32)}` as const

const policy = {
  owner: WALLET,
  validityPeriod: 86400n,
  unique: false,
  saltedNullifierOnly: true,
  minAge: 18,
  sanctionsCheck: true,
  excludedCountries: ["IRN"],
  metadataURL: "",
  hook: "0x4444444444444444444444444444444444444444",
  retiredAt: 0n,
}

function stubContext(handlers: {
  readContract?: (args: { functionName: string }) => unknown
  getLogs?: () => unknown[]
}): AttestContext {
  const publicClient = {
    readContract: async (args: never) => handlers.readContract?.(args),
    getLogs: async () => handlers.getLogs?.() ?? [],
  } as unknown as PublicClient
  return { publicClient, attest: new AttestClient({ client: publicClient, address: REGISTRY }) }
}

describe("listPoliciesWithDetails", () => {
  test("joins log summaries with full policies", async () => {
    const ctx = stubContext({
      getLogs: () => [{ args: { policyId: 42n, owner: WALLET, hook: policy.hook } }],
      readContract: () => policy,
    })
    const views = await listPoliciesWithDetails(ctx)
    expect(views).toHaveLength(1)
    expect(views[0].policyId).toBe(42n)
    expect(views[0].policy.minAge).toBe(18)
  })
})

describe("request builders", () => {
  test("createPolicyRequest carries the exact args tuple", () => {
    const request = createPolicyRequest(REGISTRY, {
      salt: SALT,
      validityPeriodSeconds: 86400n,
      unique: true,
      saltedNullifierOnly: false,
      minAge: 21,
      sanctionsCheck: true,
      excludedCountries: ["IRN", "PRK"],
      metadataURL: "https://example.com/p.json",
    })
    expect(request.address).toBe(REGISTRY)
    expect(request.functionName).toBe("createPolicy")
    expect(request.args).toEqual([
      SALT,
      86400n,
      true,
      false,
      21,
      true,
      ["IRN", "PRK"],
      "https://example.com/p.json",
    ])
  })

  test("retire and revoke target the registry", () => {
    expect(retireRequest(REGISTRY, 42n)).toMatchObject({
      address: REGISTRY,
      functionName: "retire",
      args: [42n],
    })
    expect(revokeRequest(REGISTRY, WALLET, 42n)).toMatchObject({
      address: REGISTRY,
      functionName: "revoke",
      args: [WALLET, 42n],
    })
  })
})

describe("randomSalt", () => {
  test("returns distinct 32-byte hex values", () => {
    const a = randomSalt()
    const b = randomSalt()
    expect(a).toMatch(/^0x[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe("guardianOf", () => {
  test("reads the registry guardian", async () => {
    const ctx = stubContext({ readContract: () => WALLET })
    expect(await guardianOf(ctx)).toBe(WALLET)
  })
})

describe("createAttestContext", () => {
  test("binds the registry address", () => {
    const ctx = createAttestContext(
      { chain: "ethereum_sepolia", registry: REGISTRY, popupUrl: "http://x" },
      resolveChain("ethereum_sepolia"),
    )
    expect(ctx.attest.address).toBe(REGISTRY)
  })
})
