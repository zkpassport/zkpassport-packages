import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { createRegistryClient, type RegistryClient } from "@zkpassport/registry"
import { NullifierType, type ProofResult, type Query, type QueryResult } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import { encodeFunctionResult } from "viem"
import ZKPassportVerifierAbi from "../src/assets/abi/ZKPassportVerifier.json"
import * as bbVerifier from "../src/bb-verifier"
import { ZKPassport } from "../src/index"
import { PublicInputChecker } from "../src/public-input-checker"

describe("verify() config.rpcUrl", () => {
  const circuitVersion = "0.21.0"
  const outerEvmProofName = "outer_evm_3"
  const outerEvmCircuitHash = "0x0000000000000000000000000000000000000000000000000000000000000001"
  const proofs: ProofResult[] = [
    {
      name: outerEvmProofName,
      version: circuitVersion,
      vkeyHash: outerEvmCircuitHash,
      proof: "00".repeat(32 * 20),
    },
  ]
  const originalQuery: Query = { age: { gte: 18 } }
  const queryResult: QueryResult = { age: { gte: { expected: 18, result: true } } }
  const rpcUrl = "http://rpc.test"

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

  /** The registry client verifyLocally handed to the public input checks */
  function registryClientGivenToPublicInputChecks(): RegistryClient | undefined {
    return publicInputCheckerSpy.mock.calls[0]?.[8] as RegistryClient | undefined
  }

  test("uses the configured RPC URL for the on-chain reads", async () => {
    const zkPassport = new ZKPassport("example.com")

    const { verified } = await zkPassport.verify({
      proofs,
      originalQuery,
      queryResult,
      verifierMode: "local",
      config: { rpcUrl },
    })

    const defaults = createRegistryClient("ethereum")
    expect(verified).toBe(true)
    expect(fetchedUrls).toEqual([
      new URL(defaults.getUrlForCircuitManifestByVersion(circuitVersion)).href,
      new URL(defaults.getUrlForPackagedCircuits(outerEvmCircuitHash)).href,
      new URL(rpcUrl).href,
    ])
    expect(registryClientGivenToPublicInputChecks()?.getRpcUrl()).toBe(rpcUrl)
  })

  test("uses the chain's built-in RPC URL when no config is given", async () => {
    const zkPassport = new ZKPassport("example.com")

    const { verified } = await zkPassport.verify({
      proofs,
      originalQuery,
      queryResult,
      verifierMode: "local",
    })

    const defaults = createRegistryClient("ethereum")
    expect(verified).toBe(true)
    expect(fetchedUrls[fetchedUrls.length - 1]).toBe(new URL(defaults.getRpcUrl()).href)
    expect(registryClientGivenToPublicInputChecks()?.getRpcUrl()).toBe(defaults.getRpcUrl())
  })
})
