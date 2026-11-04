import { describe, expect, test } from "bun:test"
import { NullifierType } from "@zkpassport/sdk"
import { CredentialsClient } from "@zkpassport/onchain-credentials"
import { buildCredentialProofRequest } from "../src/credential-request"
import {
  DOMAIN,
  EVALUATOR,
  POLICY_ID,
  REGISTRY,
  SAMPLE_POLICY,
  SCOPE,
  WALLET,
  fakeQueryBuilder,
  stubChain,
} from "./credential-fixtures"

const MINT = { policyId: POLICY_ID, wallet: WALLET, chain: "ethereum_sepolia" } as const

function credentialsOn(stub: Parameters<typeof stubChain>[0]) {
  const { client, readCalls } = stubChain(stub)
  return { credentials: new CredentialsClient({ client, address: REGISTRY }), readCalls }
}

describe("buildCredentialProofRequest", () => {
  test("reads scope and domain on-chain and applies predicates, facematch, and bindings", async () => {
    const { credentials } = credentialsOn({
      uniqueIdentifierType: NullifierType.SALTED,
      requirements: {
        minAge: 18,
        sanctionsMode: 1,
        faceMatchMode: 2,
        excludedNationalities: ["PRK"],
      },
    })
    const request = await buildCredentialProofRequest(credentials, MINT)
    expect(request.scope).toBe(SCOPE)
    expect(request.domain).toBe(DOMAIN)
    expect(request.uniqueIdentifierType).toBe(NullifierType.SALTED)

    const { qb, calls } = fakeQueryBuilder()
    request.query(qb)
    expect(calls).toEqual([
      { method: "gte", args: ["age", 18] },
      { method: "out", args: ["nationality", ["PRK"]] },
      { method: "sanctions", args: ["all", "all", { strict: false }] },
      // Salted nullifiers force strict facematch regardless of the policy's mode.
      { method: "facematch", args: ["strict"] },
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })

  test("the request roots in the testnet registries on a testnet, the mainnet ones on mainnet", async () => {
    // The evaluator's own flag is a different question; this must not follow it
    const { credentials } = credentialsOn({ devMode: false })
    expect((await buildCredentialProofRequest(credentials, MINT)).devMode).toBe(true)
    const onMainnet = { ...MINT, chain: "ethereum" } as const
    expect((await buildCredentialProofRequest(credentials, onMainnet)).devMode).toBe(false)
  })

  test("the issue() dev-mode flag is read off the policy's evaluator", async () => {
    for (const devMode of [true, false]) {
      const { credentials, readCalls } = credentialsOn({ devMode })
      const request = await buildCredentialProofRequest(credentials, MINT)
      expect(request.evaluatorDevMode).toBe(devMode)
      expect(readCalls.find((call) => call.functionName === "devMode")?.address).toBe(EVALUATOR)
    }
  })

  test("a uniqueness policy requests its evaluator's nullifier type", async () => {
    for (const raw of [NullifierType.NON_SALTED, NullifierType.SALTED] as const) {
      const { credentials } = credentialsOn({ uniqueIdentifierType: raw })
      expect((await buildCredentialProofRequest(credentials, MINT)).uniqueIdentifierType).toBe(raw)
    }
  })

  test("a policy without uniqueness leaves the request unconstrained, whatever the evaluator's type", async () => {
    const { credentials } = credentialsOn({
      policy: { ...SAMPLE_POLICY, enforceUniqueness: false },
      uniqueIdentifierType: NullifierType.SALTED,
      requirements: { faceMatchMode: 1 },
    })
    const request = await buildCredentialProofRequest(credentials, MINT)
    expect(request.uniqueIdentifierType).toBeUndefined()

    // No salted nullifier is requested, so the policy's regular facematch stands.
    const { qb, calls } = fakeQueryBuilder()
    request.query(qb)
    expect(calls).toContainEqual({ method: "facematch", args: ["regular"] })
  })

  test("rejects uniqueness policies on mock-type evaluators — no mock/real mapping", async () => {
    for (const raw of [NullifierType.SALTED_MOCK, NullifierType.NON_SALTED_MOCK]) {
      const { credentials } = credentialsOn({ uniqueIdentifierType: raw })
      await expect(buildCredentialProofRequest(credentials, MINT)).rejects.toThrow(
        "requires a mock nullifier type and cannot be minted",
      )
    }
  })

  test("a policy without uniqueness mints on a mock-type evaluator", async () => {
    const { credentials } = credentialsOn({
      policy: { ...SAMPLE_POLICY, enforceUniqueness: false },
      uniqueIdentifierType: NullifierType.SALTED_MOCK,
    })
    const request = await buildCredentialProofRequest(credentials, MINT)
    expect(request.uniqueIdentifierType).toBeUndefined()
  })

  test("rejects retired policies before any proof request", async () => {
    const { credentials, readCalls } = credentialsOn({
      policy: { ...SAMPLE_POLICY, retiredAt: 1700000000n },
    })
    await expect(buildCredentialProofRequest(credentials, MINT)).rejects.toThrow(
      "retired and no longer issues credentials",
    )
    expect(readCalls.map((call) => call.functionName)).not.toContain("decodeRequirements")
  })
})
