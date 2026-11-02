import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { RegistryClient } from "@zkpassport/registry"
import { NullifierType, type ProofResult, type Query, type QueryResult } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import * as bbVerifier from "../src/bb-verifier"
import { ZKPassport } from "../src/index"
import { PublicInputChecker } from "../src/public-input-checker"
import { outerProofCommittingTo } from "./helpers"

describe("verify() circuit manifest root", () => {
  const circuitVersion = "0.21.1"
  const outerCircuitHash = "0x0000000000000000000000000000000000000000000000000000000000000001"
  const disclosureCircuitHash = "0x0000000000000000000000000000000000000000000000000000000000000002"
  const otherRoot = "0x0000000000000000000000000000000000000000000000000000000000000003"
  const proofTimestamp = 1_760_000_000
  const originalQuery: Query = { age: { gte: 18 } }
  const queryResult: QueryResult = { age: { gte: { expected: 18, result: true } } }

  let circuitRoot: string
  let registryAcceptsRootAt: number | undefined
  let originalFetch: typeof globalThis.fetch
  let publicInputCheckerSpy: ReturnType<typeof spyOn>
  let validatePackagedCircuitSpy: ReturnType<typeof spyOn>
  let bbVerifierSpy: ReturnType<typeof spyOn>

  function outerProof(root: string): ProofResult {
    return {
      name: "outer_count_3",
      version: circuitVersion,
      vkeyHash: outerCircuitHash,
      proof: outerProofCommittingTo(root),
    }
  }

  const disclosureProof: ProofResult = {
    name: "compare_age",
    version: circuitVersion,
    vkeyHash: disclosureCircuitHash,
    proof: "00".repeat(32 * 20),
  }

  /** The circuit registry's answer to isRootValid(root, timestamp) for this eth_call data */
  function isRootValidResult(callData: string): string {
    const args = callData.slice(2 + 8)
    const root = `0x${args.slice(64, 128)}`
    const timestamp = parseInt(args.slice(128, 192), 16)
    const valid = root === circuitRoot && timestamp === registryAcceptsRootAt
    return `0x${(valid ? 1 : 0).toString(16).padStart(64, "0")}`
  }

  beforeEach(async () => {
    circuitRoot = await calculateCircuitRoot({
      hashes: [outerCircuitHash, disclosureCircuitHash],
    })
    registryAcceptsRootAt = proofTimestamp

    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString()).href
      if (url.includes("/by-version/")) {
        return Response.json({
          version: circuitVersion,
          root: circuitRoot,
          circuits: {
            outer_count_3: { hash: outerCircuitHash },
            compare_age: { hash: disclosureCircuitHash },
          },
        })
      }
      if (url.includes("/by-hash/")) {
        const hash = url.endsWith(`${outerCircuitHash}.json`)
          ? outerCircuitHash
          : disclosureCircuitHash
        return Response.json({
          name: hash === outerCircuitHash ? "outer_count_3" : "compare_age",
          hash,
          noir_version: "1.0.0",
          bb_version: "6.0.0",
          vkey: "",
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
    validatePackagedCircuitSpy = spyOn(RegistryClient, "validatePackagedCircuit").mockResolvedValue(
      true,
    )
    bbVerifierSpy = spyOn(bbVerifier, "createUltraHonkVerifier").mockResolvedValue({
      verifier: { verifyProof: async () => true },
      destroy: async () => {},
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    publicInputCheckerSpy.mockRestore()
    validatePackagedCircuitSpy.mockRestore()
    bbVerifierSpy.mockRestore()
  })

  async function verifyLocally(proofs: ProofResult[]) {
    const zkPassport = new ZKPassport("example.com")
    return zkPassport.verify({ proofs, originalQuery, queryResult, verifierMode: "local" })
  }

  test("verifies an outer proof against the manifest of the root it commits to", async () => {
    const { verified } = await verifyLocally([outerProof(circuitRoot)])

    expect(verified).toBe(true)
  })

  test("rejects an outer proof that commits to another root than the manifest's", async () => {
    const { verified } = await verifyLocally([outerProof(otherRoot)])

    expect(verified).toBe(false)
    expect(bbVerifierSpy).not.toHaveBeenCalled()
  })

  test("verifies fast-mode proofs whose manifest root the registry accepts at their date", async () => {
    const { verified } = await verifyLocally([disclosureProof])

    expect(verified).toBe(true)
  })

  test("rejects fast-mode proofs whose manifest root the registry rejects at their date", async () => {
    registryAcceptsRootAt = proofTimestamp - 1

    const { verified } = await verifyLocally([disclosureProof])

    expect(verified).toBe(false)
    expect(bbVerifierSpy).not.toHaveBeenCalled()
  })
})
