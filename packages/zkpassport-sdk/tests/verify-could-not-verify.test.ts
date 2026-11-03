import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { RegistryClient } from "@zkpassport/registry"
import { NullifierType, type ProofResult, type Query, type QueryResult } from "@zkpassport/utils"
import { encodeFunctionResult } from "viem"
import ZKPassportVerifierAbi from "../src/assets/abi/ZKPassportVerifier.json"
import * as bbVerifier from "../src/bb-verifier"
import { ZKPassport, type VerifierMode } from "../src/index"
import { PublicInputChecker } from "../src/public-input-checker"
import { VerificationUnavailableError } from "../src/verification-unavailable"

describe("verify() tells an invalid proof from a check that could not run", () => {
  const circuitVersion = "0.21.0"
  const circuitHash = "0x" + "00".repeat(31) + "01"
  const rpcUrl = "http://rpc.test"
  const verifierApiUrl = "https://verifier.zkpassport.id/verify"
  // Verified on chain by the Solidity verifier
  const onChainProofs: ProofResult[] = [
    {
      name: "outer_evm_3",
      version: circuitVersion,
      vkeyHash: circuitHash,
      proof: "00".repeat(640),
    },
  ]
  // Verified in process by bb.js
  const bbProofs: ProofResult[] = [
    { name: "outer_5", version: circuitVersion, vkeyHash: circuitHash, proof: "00".repeat(640) },
  ]
  const originalQuery: Query = { age: { gte: 18 } }
  const queryResult: QueryResult = { age: { gte: { expected: 18, result: true } } }

  let originalFetch: typeof globalThis.fetch
  let originalWarn: typeof console.warn
  let publicInputCheckerSpy: ReturnType<typeof spyOn>
  let circuitManifestSpy: ReturnType<typeof spyOn>
  let packagedCircuitSpy: ReturnType<typeof spyOn>
  let bbVerifierSpy: ReturnType<typeof spyOn>

  /** Answers the on-chain verification call with the verdict the contract would return */
  function respondWithContractVerdict(verdict: boolean) {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const { id } = JSON.parse(init?.body as string) as { id: number }
      return Response.json({
        jsonrpc: "2.0",
        id,
        result: encodeFunctionResult({
          abi: ZKPassportVerifierAbi.abi,
          functionName: "verify",
          result: [verdict, `0x${"00".repeat(32)}`, `0x${"00".repeat(20)}`],
        }),
      })
    }) as typeof globalThis.fetch
  }

  function verifyProofs(proofs: ProofResult[], verifierMode: VerifierMode = "local") {
    return new ZKPassport("example.com").verify({
      proofs,
      originalQuery,
      queryResult,
      verifierMode,
      config: { rpcUrl },
    })
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch
    originalWarn = console.warn
    console.warn = () => {}
    respondWithContractVerdict(true)

    publicInputCheckerSpy = spyOn(PublicInputChecker, "checkPublicInputs").mockResolvedValue({
      isCorrect: true,
      uniqueIdentifier: "1",
      uniqueIdentifierType: NullifierType.NON_SALTED,
      queryResultErrors: {},
    })
    circuitManifestSpy = spyOn(RegistryClient.prototype, "getCircuitManifest").mockResolvedValue({
      version: circuitVersion,
      root: circuitHash,
      circuits: { outer_evm_3: { hash: circuitHash }, outer_5: { hash: circuitHash } },
    } as never)
    packagedCircuitSpy = spyOn(RegistryClient.prototype, "getPackagedCircuit").mockResolvedValue({
      name: "outer_5",
      hash: circuitHash,
      noir_version: "1.0.0",
      bb_version: "1.0.0",
      vkey: "",
    } as never)
    bbVerifierSpy = spyOn(bbVerifier, "createUltraHonkVerifier").mockResolvedValue({
      verifier: { verifyProof: async () => true },
      destroy: async () => {},
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    console.warn = originalWarn
    publicInputCheckerSpy.mockRestore()
    circuitManifestSpy.mockRestore()
    packagedCircuitSpy.mockRestore()
    bbVerifierSpy.mockRestore()
  })

  test("reports an RPC that never answers as no verdict", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connection refused")
    }) as typeof globalThis.fetch

    const result = await verifyProofs(onChainProofs)

    expect(result).toEqual({
      uniqueIdentifier: undefined,
      uniqueIdentifierType: undefined,
      verified: false,
      couldNotVerify: "registry_unavailable",
    })
  })

  test("reports a proof the verifier contract rejects as invalid", async () => {
    respondWithContractVerdict(false)

    const result = await verifyProofs(onChainProofs)

    expect(result.verified).toBe(false)
    expect(result.couldNotVerify).toBeUndefined()
  })

  test("reports a proof the verifier contract reverts on as invalid", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const { id } = JSON.parse(init?.body as string) as { id: number }
      return Response.json({
        jsonrpc: "2.0",
        id,
        error: { code: 3, message: "execution reverted" },
      })
    }) as typeof globalThis.fetch

    const result = await verifyProofs(onChainProofs)

    expect(result.verified).toBe(false)
    expect(result.couldNotVerify).toBeUndefined()
  })

  test("reports a bb.js that cannot run the check as no verdict", async () => {
    bbVerifierSpy.mockResolvedValue({
      verifier: {
        verifyProof: async () => {
          throw new Error("unsupported proof format")
        },
      },
      destroy: async () => {},
    })

    const result = await verifyProofs(bbProofs)

    expect(result).toEqual({
      uniqueIdentifier: undefined,
      uniqueIdentifierType: undefined,
      verified: false,
      couldNotVerify: "engine_error",
    })
  })

  test("reports a proof bb.js rejects as invalid", async () => {
    bbVerifierSpy.mockResolvedValue({
      verifier: { verifyProof: async () => false },
      destroy: async () => {},
    })

    const result = await verifyProofs(bbProofs)

    expect(result.verified).toBe(false)
    expect(result.couldNotVerify).toBeUndefined()
  })

  test("reports a registry that never answers as no verdict", async () => {
    publicInputCheckerSpy.mockImplementation(async () => {
      throw new VerificationUnavailableError(
        "registry_unavailable",
        "The registry did not answer the root check",
      )
    })

    const result = await verifyProofs(bbProofs)

    expect(result.verified).toBe(false)
    expect(result.couldNotVerify).toBe("registry_unavailable")
  })

  test("auto keeps the local reason when the verifier API gives no verdict either", async () => {
    bbVerifierSpy.mockResolvedValue({
      verifier: {
        verifyProof: async () => {
          throw new Error("unsupported proof format")
        },
      },
      destroy: async () => {},
    })
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe(verifierApiUrl)
      return Response.json({ error: "verifier down" }, { status: 503 })
    }) as typeof globalThis.fetch

    const result = await verifyProofs(bbProofs, "auto")

    expect(result.verified).toBe(false)
    expect(result.couldNotVerify).toBe("engine_error")
  })

  test("auto drops the reason once the verifier API reaches a verdict", async () => {
    bbVerifierSpy.mockResolvedValue({
      verifier: {
        verifyProof: async () => {
          throw new Error("unsupported proof format")
        },
      },
      destroy: async () => {},
    })
    globalThis.fetch = (async () =>
      Response.json({
        verified: true,
        uniqueIdentifier: "1",
        uniqueIdentifierType: NullifierType.NON_SALTED,
      })) as typeof globalThis.fetch

    const result = await verifyProofs(bbProofs, "auto")

    expect(result.verified).toBe(true)
    expect(result.couldNotVerify).toBeUndefined()
  })
})
