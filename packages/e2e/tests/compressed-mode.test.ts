/**
 * Compressed mode, end to end on a fork of Sepolia:
 *
 *   SDK request() → bridge → headless app (john, ZKR mock passport) → accept → 5 subproofs
 *   → 1 outer proof → done → SDK onSuccess
 *   → verify({ devMode: true, verifierMode: "local" }) against Sepolia's registries
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { QueryResult } from "@zkpassport/utils"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import type { HeadlessApp } from "../src/headless-app"
import { startTestEnv, type TestEnv } from "../src/test-env"
import { withFlippedProofByte } from "./tampered-proof"

describe("compressed mode, end to end on a Sepolia fork", () => {
  let testEnv: TestEnv
  let app: HeadlessApp

  beforeAll(async () => {
    testEnv = await startTestEnv()
    app = await testEnv.runHeadlessApp({
      passport: createMockPassport(),
      query: (query) => query.gte("age", 18).disclose("nationality"),
      mode: "compressed",
    })
  }, 420_000)

  afterAll(() => testEnv?.stop())

  test("the SDK gets one outer proof over the bridge", () => {
    expect(app.chain).toBe("ethereum_sepolia")
    expect(app.request.events.map((event) => event.type)).toEqual([
      "requestReceived",
      "generatingProof",
      "proofGenerated",
      "success",
    ])
    expect(app.request.generatedProofs().map((proof) => proof.name)).toEqual(["outer_count_5"])

    const { result: queryResult } = app.request.result()!
    expect(queryResult).toEqual({
      age: { gte: { expected: 18, result: true } },
      nationality: { disclose: { result: "ZKR" as string } },
    } as QueryResult) // ZKR is a mock country, not in the Alpha3Code list
  })

  test("the outer proof verifies against Sepolia's registries", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const verification = await testEnv.verify({
      proofs,
      queryResult,
      originalQuery: app.request.query,
    })
    expect(verification.verified).toBe(true)
    // ZKR passports get a mock nullifier, which verify() accepts only in dev mode
    expect(verification.uniqueIdentifierType).toBe(2) // NullifierType.NON_SALTED_MOCK
  }, 60_000)

  test("a tampered outer proof does not verify", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const verification = await testEnv.verify({
      proofs: proofs.map(withFlippedProofByte),
      queryResult,
      originalQuery: app.request.query,
    })
    expect(verification.verified).toBe(false)
  }, 60_000)

  test("nothing but the SDK's dashboard lookup tried to reach other hosts", () => {
    // request() looks the domain up on the dashboard API and carries on when that fails
    expect(
      testEnv.blockedFetches.every((url) => url.startsWith("https://dashboard-api.zkpassport.id/")),
    ).toBe(true)
  })
})
