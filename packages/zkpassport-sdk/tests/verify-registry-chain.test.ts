import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { createRegistryClient } from "@zkpassport/registry"
import {
  getChainFromQuery,
  NullifierType,
  type ProofResult,
  type Query,
  type QueryResult,
  type SupportedChain,
} from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import { encodeFunctionResult } from "viem"
import ZKPassportVerifierAbi from "../src/assets/abi/ZKPassportVerifier.json"
import * as bbVerifier from "../src/bb-verifier"
import { ZKPassport } from "../src/index"
import { PublicInputChecker } from "../src/public-input-checker"

describe("verify() registry chain", () => {
  const circuitVersion = "0.21.0"
  const outerEvmProofName = "outer_evm_3"
  const outerEvmCircuitHash = "0x0000000000000000000000000000000000000000000000000000000000000001"
  const outerEvmProofFieldCount = 20
  const proofs: ProofResult[] = [
    {
      name: outerEvmProofName,
      version: circuitVersion,
      vkeyHash: outerEvmCircuitHash,
      proof: "00".repeat(32 * outerEvmProofFieldCount),
    },
  ]
  const queryResult: QueryResult = { age: { gte: { expected: 18, result: true } } }

  let originalFetch: typeof globalThis.fetch
  let fetchedUrls: string[]
  let publicInputCheckerSpy: ReturnType<typeof spyOn>
  let bbVerifierSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    const circuitRoot = await calculateCircuitRoot({ hashes: [outerEvmCircuitHash] })

    originalFetch = globalThis.fetch
    fetchedUrls = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString()).href
      fetchedUrls.push(url)
      if (url.includes("/by-version/")) {
        return Response.json({
          version: circuitVersion,
          root: circuitRoot,
          circuits: { [outerEvmProofName]: { hash: outerEvmCircuitHash } },
        })
      }
      if (url.includes("/by-hash/")) {
        return Response.json({
          name: outerEvmProofName,
          hash: outerEvmCircuitHash,
          noir_version: "1.0.0",
          bb_version: "1.0.0",
          vkey: "",
        })
      }
      const { id } = JSON.parse(init?.body as string) as { id: number }
      const verifyResult = encodeFunctionResult({
        abi: ZKPassportVerifierAbi.abi,
        functionName: "verify",
        result: [true, `0x${"00".repeat(32)}`, `0x${"00".repeat(20)}`],
      })
      return Response.json({ jsonrpc: "2.0", id, result: verifyResult })
    }) as typeof globalThis.fetch

    publicInputCheckerSpy = spyOn(PublicInputChecker, "checkPublicInputs").mockResolvedValue({
      isCorrect: true,
      uniqueIdentifier: "1",
      uniqueIdentifierType: NullifierType.NON_SALTED,
      queryResultErrors: {},
    })
    bbVerifierSpy = spyOn(bbVerifier, "createUltraHonkVerifier").mockResolvedValue({
      verifier: { verifyProof: async () => true },
      destroy: async () => {},
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    publicInputCheckerSpy.mockRestore()
    bbVerifierSpy.mockRestore()
  })

  /** Normalized URLs of the circuit manifest, packaged circuit and RPC endpoint of a chain */
  function getChainUrls(chain: SupportedChain): string[] {
    const registryClient = createRegistryClient(chain)
    return [
      registryClient.getUrlForCircuitManifestByVersion(circuitVersion),
      registryClient.getUrlForPackagedCircuits(outerEvmCircuitHash),
      registryClient.getRpcUrl(),
    ].map((url) => new URL(url).href)
  }

  async function verifyOuterEvmProof(originalQuery: Query, devMode: boolean) {
    const zkPassport = new ZKPassport("example.com")
    return zkPassport.verify({
      proofs,
      originalQuery,
      queryResult,
      devMode,
      verifierMode: "local",
    })
  }

  test("verifies an outer EVM proof on the query's bound chain", async () => {
    for (const chain of ["base", "robinhood", "ethereum_sepolia"] as const) {
      fetchedUrls = []
      const originalQuery: Query = { age: { gte: 18 }, bind: { chain } }

      const { verified } = await verifyOuterEvmProof(originalQuery, false)

      expect(verified).toBe(true)
      expect(fetchedUrls).toEqual(getChainUrls(chain))
    }
  })

  test("verifies an unbound query's outer EVM proof on Sepolia in dev mode and on Ethereum otherwise", async () => {
    const originalQuery: Query = { age: { gte: 18 } }

    for (const devMode of [true, false]) {
      fetchedUrls = []

      const { verified } = await verifyOuterEvmProof(originalQuery, devMode)

      expect(verified).toBe(true)
      expect(fetchedUrls).toEqual(getChainUrls(getChainFromQuery(originalQuery, devMode)))
    }
  })
})
