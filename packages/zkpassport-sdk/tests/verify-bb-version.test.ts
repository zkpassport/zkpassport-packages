import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { RegistryClient } from "@zkpassport/registry"
import { NullifierType, type ProofResult, type Query, type QueryResult } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import * as bbVerifier from "../src/bb-verifier"
import { VERIFIER_API_BASE_URL } from "../src/constants"
import { ZKPassport } from "../src/index"
import { PublicInputChecker } from "../src/public-input-checker"
import { outerProofCommittingTo } from "./helpers"

describe("verify() bb version", () => {
  const circuitVersion = "0.21.1"
  const outerProofName = "outer_count_3"
  const outerCircuitHash = "0x0000000000000000000000000000000000000000000000000000000000000001"
  let proofs: ProofResult[]
  const originalQuery: Query = { age: { gte: 18 } }
  const queryResult: QueryResult = { age: { gte: { expected: 18, result: true } } }

  let packagedBBVersion: string
  let originalFetch: typeof globalThis.fetch
  let originalWarn: typeof console.warn
  let warnings: string[]
  let fetchedUrls: string[]
  let publicInputCheckerSpy: ReturnType<typeof spyOn>
  let validatePackagedCircuitSpy: ReturnType<typeof spyOn>
  let bbVerifierSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    const circuitRoot = await calculateCircuitRoot({ hashes: [outerCircuitHash] })
    proofs = [
      {
        name: outerProofName,
        version: circuitVersion,
        vkeyHash: outerCircuitHash,
        proof: outerProofCommittingTo(circuitRoot),
      },
    ]

    originalWarn = console.warn
    warnings = []
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "))
    }
    originalFetch = globalThis.fetch
    fetchedUrls = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input.toString()).href
      fetchedUrls.push(url)
      if (url.includes("/by-version/")) {
        return Response.json({
          version: circuitVersion,
          root: circuitRoot,
          circuits: { [outerProofName]: { hash: outerCircuitHash } },
        })
      }
      if (url.includes("/by-hash/")) {
        return Response.json({
          name: outerProofName,
          hash: outerCircuitHash,
          noir_version: "1.0.0",
          bb_version: packagedBBVersion,
          vkey: "",
        })
      }
      return Response.json({
        verified: true,
        uniqueIdentifier: "1",
        uniqueIdentifierType: NullifierType.NON_SALTED,
      })
    }) as typeof globalThis.fetch

    publicInputCheckerSpy = spyOn(PublicInputChecker, "checkPublicInputs").mockResolvedValue({
      isCorrect: true,
      uniqueIdentifier: "1",
      uniqueIdentifierType: NullifierType.NON_SALTED,
      queryResultErrors: {},
      rootTimestamp: undefined,
    })
    validatePackagedCircuitSpy = spyOn(RegistryClient, "validatePackagedCircuit").mockResolvedValue(
      true,
    )
    bbVerifierSpy = spyOn(bbVerifier, "createUltraHonkVerifier").mockResolvedValue({
      verifier: { verifyProof: async () => true },
      destroy: async () => {},
    })
  })

  afterEach(() => {
    console.warn = originalWarn
    globalThis.fetch = originalFetch
    publicInputCheckerSpy.mockRestore()
    validatePackagedCircuitSpy.mockRestore()
    bbVerifierSpy.mockRestore()
  })

  test("rejects and logs a proof from a bb version it has no verifier for, and runs no verifier", async () => {
    for (const bbVersion of ["4.2.0-aztecnr-rc.2", "6.0.1", "7.0.0"]) {
      packagedBBVersion = bbVersion
      warnings = []
      const zkPassport = new ZKPassport("example.com")

      const result = await zkPassport.verify({
        proofs,
        originalQuery,
        queryResult,
        verifierMode: "local",
      })

      expect(result.verified).toBe(false)
      expect(warnings.some((warning) => warning.includes(bbVersion))).toBe(true)
      expect(bbVerifierSpy).not.toHaveBeenCalled()
    }
  })

  test("asks the verifier API in auto mode for a bb version it has no verifier for", async () => {
    packagedBBVersion = "7.0.0"
    const zkPassport = new ZKPassport("example.com")

    const result = await zkPassport.verify({ proofs, originalQuery, queryResult })

    expect(result.verified).toBe(true)
    expect(fetchedUrls).toContain(new URL(`${VERIFIER_API_BASE_URL}/verify`).href)
  })
})
