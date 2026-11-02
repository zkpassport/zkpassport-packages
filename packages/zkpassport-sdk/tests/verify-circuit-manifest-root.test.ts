import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { NullifierType, type ProofResult, type Query, type QueryResult } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import { ZKPassport } from "../src/index"
import { PublicInputChecker } from "../src/public-input-checker"

describe("verify() circuit manifest root", () => {
  const circuitVersion = "0.21.1"
  const circuitHash = "0x0000000000000000000000000000000000000000000000000000000000000002"
  const proofTimestamp = 1_760_000_000
  const proof: ProofResult = {
    name: "compare_age",
    version: circuitVersion,
    vkeyHash: circuitHash,
    proof: "00".repeat(32 * 20),
  }
  const originalQuery: Query = { age: { gte: 18 } }
  const queryResult: QueryResult = { age: { gte: { expected: 18, result: true } } }

  let circuitRoot: string
  let originalFetch: typeof globalThis.fetch
  let publicInputCheckerSpy: ReturnType<typeof spyOn>

  /** The circuit registry accepts the manifest's root at any time but the proofs' date */
  function isRootValidResult(callData: string): string {
    const args = callData.slice(2 + 8)
    const root = `0x${args.slice(64, 128)}`
    const timestamp = parseInt(args.slice(128, 192), 16)
    const valid = root === circuitRoot && timestamp !== proofTimestamp
    return `0x${(valid ? 1 : 0).toString(16).padStart(64, "0")}`
  }

  beforeEach(async () => {
    circuitRoot = await calculateCircuitRoot({ hashes: [circuitHash] })

    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(input.toString()).href.includes("/by-version/")) {
        return Response.json({
          version: circuitVersion,
          root: circuitRoot,
          circuits: { compare_age: { hash: circuitHash } },
        })
      }
      const { id, params } = JSON.parse(init?.body as string) as {
        id: number
        params: [{ data: string }]
      }
      return Response.json({ jsonrpc: "2.0", id, result: isRootValidResult(params[0].data) })
    }) as typeof globalThis.fetch

    publicInputCheckerSpy = spyOn(PublicInputChecker, "checkPublicInputs").mockResolvedValue({
      isCorrect: true,
      uniqueIdentifier: "1",
      uniqueIdentifierType: NullifierType.NON_SALTED,
      queryResultErrors: {},
      rootTimestamp: proofTimestamp,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    publicInputCheckerSpy.mockRestore()
  })

  test("checks a fast-mode manifest's root with the registry as of the proofs' date", async () => {
    const zkPassport = new ZKPassport("example.com")

    const { verified } = await zkPassport.verify({
      proofs: [proof],
      originalQuery,
      queryResult,
      verifierMode: "local",
    })

    expect(verified).toBe(false)
  })
})
