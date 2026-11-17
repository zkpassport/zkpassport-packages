/**
 * Bound data, end to end on a fork of Sepolia, in compressed mode with a 32-byte address:
 *
 *   SDK request() with bind → bridge → headless app (john, ZKR mock passport) → accept
 *   → 5 subproofs, bind among them → 1 outer proof → done → SDK onSuccess
 *   → verify({ devMode: true, verifierMode: "local" }) against Sepolia's registries
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { QueryResult } from "@zkpassport/utils"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import type { HeadlessApp } from "../src/headless-app"
import { startTestEnv, type TestEnv } from "../src/test-env"

const AZTEC_ADDRESS = "0x1122334455667788990011223344556677889900112233445566778899001122"

describe("bound data, end to end on a Sepolia fork", () => {
  let testEnv: TestEnv
  let app: HeadlessApp

  beforeAll(async () => {
    testEnv = await startTestEnv()
    app = await testEnv.runHeadlessApp({
      passport: createMockPassport(),
      query: (query) => query.gte("age", 18).bind("user_address", AZTEC_ADDRESS),
      mode: "compressed",
    })
  }, 420_000)

  afterAll(() => testEnv?.stop())

  test("the SDK gets one outer proof with the bound address", () => {
    expect(app.request.generatedProofs().map((proof) => proof.name)).toEqual(["outer_count_5"])

    const { result: queryResult } = app.request.result()!
    expect(queryResult).toEqual({
      age: { gte: { expected: 18, result: true } },
      bind: { user_address: AZTEC_ADDRESS },
    } as QueryResult)
  })

  test("the outer proof verifies against Sepolia's registries", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const verification = await testEnv.verify({
      proofs,
      queryResult,
      originalQuery: app.request.query,
    })
    expect(verification.verified).toBe(true)
  }, 60_000)

  test("the proof does not verify for another address", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const verification = await testEnv.verify({
      proofs,
      queryResult: { ...queryResult, bind: { user_address: `0x${"33".repeat(32)}` } },
      originalQuery: { ...app.request.query, bind: { user_address: `0x${"33".repeat(32)}` } },
    })
    expect(verification.verified).toBe(false)
  }, 60_000)
})
