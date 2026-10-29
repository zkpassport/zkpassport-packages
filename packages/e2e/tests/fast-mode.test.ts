/**
 * Fast mode, end to end on a fork of Sepolia:
 *
 *   SDK request() → bridge → headless app (john, ZKR mock passport) → accept → 5 proofs → done
 *   → SDK onSuccess → verify({ devMode: true, verifierMode: "local" }) against Sepolia's registries
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { QueryResult } from "@zkpassport/utils"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import type { HeadlessApp } from "../src/headless-app"
import { startTestEnv, type TestEnv } from "../src/test-env"
import { withFlippedProofByte } from "./tampered-proof"

const CIRCUITS = [
  "sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256",
  "sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256",
  "data_check_integrity_sa_sha256_dg_sha256",
  "compare_age",
  "disclose_bytes",
]

describe("fast mode, end to end on a Sepolia fork", () => {
  let testEnv: TestEnv
  let app: HeadlessApp

  beforeAll(async () => {
    testEnv = await startTestEnv()
    app = await testEnv.runHeadlessApp({
      passport: createMockPassport(),
      query: (query) => query.gte("age", 18).disclose("nationality"),
    })
  }, 180_000)

  afterAll(() => testEnv?.stop())

  test("the SDK sees the whole request over the bridge", () => {
    expect(app.chain).toBe("ethereum_sepolia")
    expect(app.request.events.map((event) => event.type)).toEqual([
      "requestReceived",
      "generatingProof",
      ...CIRCUITS.map(() => "proofGenerated" as const),
      "success",
    ])
    expect(app.request.generatedProofs().map((proof) => proof.name)).toEqual(CIRCUITS)

    const { result: queryResult } = app.request.result()!
    expect(queryResult).toEqual({
      age: { gte: { expected: 18, result: true } },
      nationality: { disclose: { result: "ZKR" as string } },
    } as QueryResult) // ZKR is a mock country, not in the Alpha3Code list
  })

  test("the proofs verify against Sepolia's registries", async () => {
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

  test("a tampered proof does not verify", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const tamperedProofs = proofs.map((proof) =>
      proof.name === "disclose_bytes" ? withFlippedProofByte(proof) : proof,
    )

    const verification = await testEnv.verify({
      proofs: tamperedProofs,
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
