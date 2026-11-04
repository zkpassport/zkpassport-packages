/**
 * Sanctions, end to end on a fork of Sepolia, against the sanctions root on chain:
 *
 *   SDK request() with .sanctions() in dev mode → bridge → headless app (john) proves against the
 *   tree published for Sepolia's latest sanctions root → SDK verify() checks that root in the
 *   Sanctions Registry
 *
 * For a sanctioned person, the headless app reports "Sanctions check failed" to the SDK instead of
 * proving, as the app does.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import type { HeadlessApp } from "../src/headless-app"
import { startTestEnv, type TestEnv } from "../src/test-env"

// A public official on OFAC's list since 2006. Tests expecting this person to be sanctioned will fail
// when they are removed from it. We just need to find another example when that happens.
// Alternatives considered:
// 1. Introduce mock sanctioned data in Sepolia: it complicates the publishing pipeline but it provides
// more flexibility. Potentially useful in the future.
// 2. Pick a person from live OpenSanctions data. Least maintenance involved to keep working, but
// introduces complexity around downloading and caching. Seems overkill for now.
const SANCTIONED_PERSON = {
  firstName: "Lidziya",
  middleName: "Mihaulauna",
  lastName: "Yarmoshina",
  dateOfBirth: new Date("1953-01-29"),
}

describe("sanctions, end to end on a Sepolia fork", () => {
  let testEnv: TestEnv
  let sanctionsRoot: string
  let app: HeadlessApp

  beforeAll(async () => {
    testEnv = await startTestEnv()
    sanctionsRoot = await testEnv.registry.getLatestSanctionsRoot()
    app = await testEnv.runHeadlessApp({
      passport: createMockPassport(),
      query: (query) => query.sanctions(),
    })
  }, 180_000)

  afterAll(() => testEnv?.stop())

  test("john passes the non-strict sanctions check", () => {
    const { result: queryResult } = app.request.result()!
    expect(queryResult.sanctions?.passed).toBe(true)
    expect(queryResult.sanctions?.isStrict).toBe(false)
  })

  test("the sanctions proof commits to Sepolia's latest sanctions root", () => {
    const { proofs } = app.request.result()!
    const sanctionsProof = proofs.find((proof) => proof.name === "exclusion_check_sanctions")!
    expect(sanctionsProof.committedInputs?.exclusion_check_sanctions).toEqual({
      rootHash: sanctionsRoot,
      isStrict: false,
    })
  })

  test("the proofs verify against Sepolia's registries", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const verification = await testEnv.verify({
      proofs,
      queryResult,
      originalQuery: app.request.query,
    })
    expect(verification.queryResultErrors).toBeUndefined()
    expect(verification.verified).toBe(true)
  }, 60_000)

  test("a proof whose committed root was swapped does not verify", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const tamperedProofs = proofs.map((proof) => ({ ...proof }))
    const target = tamperedProofs.find((proof) => proof.name === "exclusion_check_sanctions")!
    target.committedInputs = {
      exclusion_check_sanctions: { rootHash: `0x${"0".repeat(63)}1`, isStrict: false },
    }

    const verification = await testEnv.verify({
      proofs: tamperedProofs,
      queryResult,
      originalQuery: app.request.query,
    })
    expect(verification.verified).toBe(false)
  }, 60_000)

  test("a sanctioned person's passport fails the sanctions check", async () => {
    const sanctionedApp = await testEnv.runHeadlessApp({
      passport: createMockPassport(SANCTIONED_PERSON),
      query: (query) => query.sanctions(),
    })

    expect(sanctionedApp.request.errors()).toEqual(["Sanctions check failed"])
    expect(sanctionedApp.request.generatedProofs()).toEqual([])
  }, 60_000)
})
