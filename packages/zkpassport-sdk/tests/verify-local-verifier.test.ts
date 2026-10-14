import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { ProofResult, Query, QueryResult } from "@zkpassport/utils"
import * as bbVerifier from "../src/bb-verifier"
import { ZKPassport } from "../src/index"
import { PublicInputChecker } from "../src/public-input-checker"

describe("verify() local verifier", () => {
  const proofs: ProofResult[] = [
    {
      name: "disclose_bytes",
      version: "0.21.0",
      vkeyHash: `0x${"00".repeat(32)}`,
      proof: "00".repeat(32 * 20),
    },
  ]
  const originalQuery: Query = { age: { gte: 18 } }
  const queryResult: QueryResult = { age: { gte: { expected: 18, result: true } } }

  let publicInputCheckerSpy: ReturnType<typeof spyOn>
  let bbVerifierSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    publicInputCheckerSpy = spyOn(PublicInputChecker, "checkPublicInputs").mockResolvedValue({
      isCorrect: false,
      uniqueIdentifier: undefined,
      uniqueIdentifierType: undefined,
      queryResultErrors: {},
    })
    bbVerifierSpy = spyOn(bbVerifier, "createUltraHonkVerifier")
  })

  afterEach(() => {
    publicInputCheckerSpy.mockRestore()
    bbVerifierSpy.mockRestore()
  })

  test("does not start a verifier when the public inputs are wrong", async () => {
    const { verified } = await new ZKPassport("example.com").verify({
      proofs,
      originalQuery,
      queryResult,
      verifierMode: "local",
    })

    expect(verified).toBe(false)
    expect(bbVerifierSpy).not.toHaveBeenCalled()
  })
})
