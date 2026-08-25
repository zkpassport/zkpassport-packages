import { describe, expect, test } from "bun:test"
import { AttestClient, type AttestPolicy, type AttestReadClient } from "../src/attest"

const REGISTRY = "0x1111111111111111111111111111111111111111" as const
const WALLET = "0x2222222222222222222222222222222222222222" as const
const HOOK = "0x3333333333333333333333333333333333333333" as const
const POLICY_ID = 42n

const SAMPLE_POLICY: AttestPolicy = {
  owner: WALLET,
  validityPeriod: 2592000n,
  unique: true,
  saltedNullifierOnly: false,
  minAge: 18,
  sanctionsCheck: true,
  excludedCountries: ["PRK"],
  metadataURL: "https://policy.example/kyc",
  hook: HOOK,
  retiredAt: 0n,
}

function stubClient(
  read: (params: { functionName: string; args?: readonly unknown[] }) => unknown,
) {
  const readCalls: { address: string; functionName: string; args?: readonly unknown[] }[] = []
  const logCalls: Record<string, unknown>[] = []
  const client = {
    readContract: async (params: never) => {
      const p = params as { address: string; functionName: string; args?: readonly unknown[] }
      readCalls.push(p)
      return read(p)
    },
    getLogs: async (params: never) => {
      logCalls.push(params as Record<string, unknown>)
      return []
    },
  } as unknown as AttestReadClient
  return { client, readCalls, logCalls }
}

describe("AttestClient reads", () => {
  test("getPolicy forwards args and returns the decoded policy", async () => {
    const { client, readCalls } = stubClient(() => SAMPLE_POLICY)
    const attest = new AttestClient({ client, address: REGISTRY })
    const policy = await attest.getPolicy(POLICY_ID)
    expect(policy).toEqual(SAMPLE_POLICY)
    expect(readCalls[0].address).toBe(REGISTRY)
    expect(readCalls[0].functionName).toBe("getPolicy")
    expect(readCalls[0].args).toEqual([POLICY_ID])
  })

  test("uri, balanceOf, heldUntil, policyScope forward the right calls", async () => {
    const results: Record<string, unknown> = {
      uri: "https://policy.example/kyc",
      balanceOf: 1n,
      heldUntil: 1702592000n,
      policyScope: "attest:0x00000000000000000000000000000000000000000000000000000000000000002a",
    }
    const { client, readCalls } = stubClient((p) => results[p.functionName])
    const attest = new AttestClient({ client, address: REGISTRY })
    expect(await attest.uri(POLICY_ID)).toBe(results.uri as string)
    expect(await attest.balanceOf(WALLET, POLICY_ID)).toBe(1n)
    expect(await attest.heldUntil(WALLET, POLICY_ID)).toBe(1702592000n)
    expect(await attest.policyScope(POLICY_ID)).toBe(results.policyScope as string)
    expect(readCalls.map((c) => c.functionName)).toEqual([
      "uri",
      "balanceOf",
      "heldUntil",
      "policyScope",
    ])
    expect(readCalls[1].args).toEqual([WALLET, POLICY_ID])
    expect(readCalls[2].args).toEqual([WALLET, POLICY_ID])
  })

  test("hookFor returns the hook from getPolicy", async () => {
    const { client } = stubClient(() => SAMPLE_POLICY)
    const attest = new AttestClient({ client, address: REGISTRY })
    expect(await attest.hookFor(POLICY_ID)).toBe(HOOK)
  })
})
