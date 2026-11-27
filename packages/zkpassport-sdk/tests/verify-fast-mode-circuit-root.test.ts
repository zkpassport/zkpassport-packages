import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { RegistryClient } from "@zkpassport/registry"
import { NullifierType, type ProofResult, type Query, type QueryResult } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import * as bbVerifier from "../src/bb-verifier"
import { ZKPassport } from "../src/index"
import { PublicInputChecker } from "../src/public-input-checker"

describe("verify() fast-mode circuit root", () => {
  const circuitVersion = "0.21.0"
  const disclosureProofName = "disclose_bytes"
  const disclosureCircuitHash = "0x0000000000000000000000000000000000000000000000000000000000000001"
  const proofs: ProofResult[] = [
    {
      name: disclosureProofName,
      version: circuitVersion,
      vkeyHash: disclosureCircuitHash,
      proof: "00".repeat(32 * 20),
    },
  ]
  const originalQuery: Query = { age: { gte: 18 } }
  const queryResult: QueryResult = { age: { gte: { expected: 18, result: true } } }
  const rpcUrl = "http://rpc.test"
  const rootTimestamp = 1_700_000_000

  type RegistryAnswer = "accepted at the proofs' date" | "rpc error"
  let registryAnswer: RegistryAnswer
  let originalFetch: typeof globalThis.fetch
  let publicInputCheckerSpy: ReturnType<typeof spyOn>
  let bbVerifierSpy: ReturnType<typeof spyOn>
  let packagedCircuitValidationSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    const circuitRoot = await calculateCircuitRoot({ hashes: [disclosureCircuitHash] })

    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString()).href
      if (url.includes("/by-version/")) {
        return Response.json({
          version: circuitVersion,
          root: circuitRoot,
          circuits: { [disclosureProofName]: { hash: disclosureCircuitHash } },
        })
      }
      if (url.includes("/by-hash/")) {
        return Response.json({
          name: disclosureProofName,
          hash: disclosureCircuitHash,
          noir_version: "1.0.0",
          bb_version: "1.0.0",
          vkey: "",
        })
      }

      const { id, params } = JSON.parse(init?.body as string) as {
        id: number
        params: [{ data: string }]
      }
      if (registryAnswer === "rpc error") {
        return Response.json({ jsonrpc: "2.0", id, error: { message: "execution reverted" } })
      }
      const isAskedAtProofsDate = params[0].data.endsWith(
        circuitRoot.slice(2) + rootTimestamp.toString(16).padStart(64, "0"),
      )
      const word = (isAskedAtProofsDate ? "1" : "0").padStart(64, "0")
      return Response.json({ jsonrpc: "2.0", id, result: `0x${word}` })
    }) as typeof globalThis.fetch

    registryAnswer = "accepted at the proofs' date"
    publicInputCheckerSpy = spyOn(PublicInputChecker, "checkPublicInputs").mockResolvedValue({
      isCorrect: true,
      uniqueIdentifier: "1",
      uniqueIdentifierType: NullifierType.NON_SALTED,
      queryResultErrors: {},
      rootTimestamp,
      circuitRegistryRoot: undefined,
      verificationMethod: 100,
    })
    // The fake packaged circuit has no verification key to hash
    packagedCircuitValidationSpy = spyOn(
      RegistryClient,
      "validatePackagedCircuit",
    ).mockResolvedValue(true)
    bbVerifierSpy = spyOn(bbVerifier, "createUltraHonkVerifier").mockResolvedValue({
      verifier: { verifyProof: async () => true },
      destroy: async () => {},
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    publicInputCheckerSpy.mockRestore()
    bbVerifierSpy.mockRestore()
    packagedCircuitValidationSpy.mockRestore()
  })

  function verifyFastModeProofs() {
    const zkPassport = new ZKPassport("example.com")
    return zkPassport.verify({
      proofs,
      originalQuery,
      queryResult,
      verifierMode: "local",
      config: { rpcUrl },
    })
  }

  test("verifies proofs whose manifest root the registry accepted at their date", async () => {
    const { verified, queryResultErrors } = await verifyFastModeProofs()

    expect(verified).toBe(true)
    expect(queryResultErrors).toBeUndefined()
  })

  test("names the circuit when the registry did not accept the manifest root at the proofs' date", async () => {
    publicInputCheckerSpy.mockResolvedValue({
      isCorrect: true,
      uniqueIdentifier: "1",
      uniqueIdentifierType: NullifierType.NON_SALTED,
      queryResultErrors: {},
      rootTimestamp: rootTimestamp + 1,
      circuitRegistryRoot: undefined,
      verificationMethod: 100,
    })

    const { verified, uniqueIdentifier, queryResultErrors } = await verifyFastModeProofs()

    expect(verified).toBe(false)
    expect(uniqueIdentifier).toBeUndefined()
    expect(queryResultErrors?.outer?.circuit?.message).toBe(
      "The proof uses an unrecognized circuit",
    )
  })

  test("rejects the proofs when the registry cannot say whether the manifest root is accepted", async () => {
    registryAnswer = "rpc error"

    const { verified, queryResultErrors } = await verifyFastModeProofs()

    expect(verified).toBe(false)
    expect(queryResultErrors?.outer?.circuit?.message).toBe(
      "The proof uses an unrecognized circuit",
    )
  })
})
