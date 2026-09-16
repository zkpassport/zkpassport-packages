import { describe, expect, test } from "bun:test"
import { NullifierType } from "@zkpassport/sdk"
import { encodeIssueProofData } from "@zkpassport/onchain-credentials"
import { buildCredentialCardOptions, type CredentialVerifyOptions } from "../src/credential-options"
import {
  DOMAIN,
  POLICY_ID,
  REGISTRY,
  SCOPE,
  WALLET,
  fakeQueryBuilder,
  stubChain,
} from "./credential-fixtures"

function cardOptions(
  stub: Parameters<typeof stubChain>[0] = {},
  extra: Partial<CredentialVerifyOptions> = {},
) {
  const { client, readCalls } = stubChain(stub)
  const options = buildCredentialCardOptions({
    client,
    registryAddress: REGISTRY,
    policyId: POLICY_ID,
    wallet: WALLET,
    chain: "ethereum_sepolia",
    ...extra,
  })
  return { options, readCalls }
}

describe("buildCredentialCardOptions request props", () => {
  test("reads policy, scope, domain and devMode on-chain for an evm-mode request", async () => {
    const { options: pending, readCalls } = cardOptions()
    const options = await pending
    expect(options.scope).toBe(SCOPE)
    expect(options.domain).toBe(DOMAIN)
    expect(options.mode).toBe("compressed-evm")
    // Sepolia roots in the testnet registries even though the evaluator is not in dev mode
    expect(options.devMode).toBe(true)
    expect(options.uniqueIdentifierType).toBe(NullifierType.NON_SALTED)
    expect(readCalls.map((call) => call.functionName).sort()).toEqual([
      "decodeRequirements",
      "devMode",
      "domain",
      "getPolicy",
      "policyScope",
      "schemaVersion",
    ])
  })

  test("the relying party's name never becomes the domain", async () => {
    const options = await cardOptions({}, { name: "app.example" }).options
    expect(options.name).toBe("app.example")
    expect(options.domain).toBe(DOMAIN)
  })

  test("the request's query and nullifier type come from the policy translation", async () => {
    // Translation cases live in the credential-request tests; this pins the wiring.
    const options = await cardOptions({
      requirements: { uniqueIdentifierType: NullifierType.SALTED },
    }).options
    expect(options.uniqueIdentifierType).toBe(NullifierType.SALTED)
    const { qb, calls } = fakeQueryBuilder()
    options.query(qb)
    expect(calls[calls.length - 1]).toEqual({ method: "done", args: [] })
  })
})

describe("enriched onResult", () => {
  const PROOF = { proof: "0xdead", name: "outer_evm_5", version: "0.21.0" }
  const VERIFIER_PARAMS = {
    version: "0x0000000000000000000000000000000000000000000000000000000000000001",
    proofVerificationData: {
      vkeyHash: "0x00000000000000000000000000000000000000000000000000000000000000aa",
      proof: "0xdeadbeef",
      publicInputs: ["0x00000000000000000000000000000000000000000000000000000000000000bb"],
    },
    committedInputs: "0x1234",
    serviceConfig: { validityPeriodInSeconds: 3600, domain: DOMAIN, scope: SCOPE, devMode: false },
  }

  // The card hands its SDK instance along, and the flow derives the issue() params from it
  function fakeResponse(
    overrides: Record<string, unknown> = {},
    derive: (options: unknown) => unknown = () => VERIFIER_PARAMS,
  ) {
    return {
      verified: true,
      uniqueIdentifier: "uid-1",
      uniqueIdentifierType: undefined,
      result: {},
      proofs: [PROOF],
      sdkInstance: { getSolidityVerifierParameters: derive },
      ...overrides,
    } as never
  }

  async function deliver(
    stub: Parameters<typeof stubChain>[0],
    response: unknown,
  ): Promise<{
    result: {
      verified: boolean
      issueCall?: { address: string; functionName: string; args: readonly unknown[] }
    }
    errors: string[]
  }> {
    const results: unknown[] = []
    const errors: string[] = []
    const options = await cardOptions(stub, {
      onResult: (result) => results.push(result),
      onError: (message) => errors.push(message),
    }).options
    options.onResult!(response as never)
    return { result: results[0] as never, errors }
  }

  test("a verified result carries the issue() call for the policy's domain, scope and devMode", async () => {
    const derivations: unknown[] = []
    // The evaluator is not in dev mode, so the submission must not claim it
    const { result, errors } = await deliver(
      { devMode: false },
      fakeResponse({}, (options) => {
        derivations.push(options)
        return VERIFIER_PARAMS
      }),
    )
    expect(derivations).toEqual([{ proof: PROOF, domain: DOMAIN, scope: SCOPE, devMode: false }])
    expect(result.verified).toBe(true)
    expect(result.issueCall?.address).toBe(REGISTRY)
    expect(result.issueCall?.functionName).toBe("issue")
    expect(result.issueCall?.args).toEqual([POLICY_ID, encodeIssueProofData(VERIFIER_PARAMS)])
    expect(errors).toEqual([])
  })

  test("an unverified result omits issueCall", async () => {
    const { result } = await deliver({}, fakeResponse({ verified: false }))
    expect(result.issueCall).toBeUndefined()
  })

  test("a failed derivation omits issueCall and reports onError", async () => {
    const { result, errors } = await deliver(
      {},
      fakeResponse({}, () => {
        throw new Error("no evm proof")
      }),
    )
    expect(result.issueCall).toBeUndefined()
    expect(errors).toEqual(["no evm proof"])
  })
})
