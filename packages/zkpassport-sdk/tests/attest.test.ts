import { describe, expect, spyOn, test } from "bun:test"
import { decodeAbiParameters, getAbiItem } from "viem"
import { NullifierType } from "@zkpassport/utils"
import { PolicyEvaluatorV1Abi } from "../src/assets/abi/policy-evaluator-v1"
import { sepolia } from "viem/chains"
import {
  AttestClient,
  computePolicyId,
  createAttestContext,
  encodeAttestPolicyRequirements,
  submitAttestCall,
  submitIssueCall,
  type AttestContext,
  type AttestPolicy,
  type AttestPolicyRequirements,
  type AttestReadClient,
} from "../src/attest"
import { buildAttestProofRequest } from "../src/attest/request"
import { SolidityVerifier } from "../src/solidity-verifier"

const REGISTRY = "0x1111111111111111111111111111111111111111" as const
const WALLET = "0x2222222222222222222222222222222222222222" as const
const POLICY_ID = 42n

const EVALUATOR = "0x3333333333333333333333333333333333333333" as const

const SAMPLE_POLICY: AttestPolicy = {
  owner: WALLET,
  credentialDuration: 2592000n,
  ownerIssuable: false,
  ownerBannable: false,
  ownerEditable: false,
  evaluator: EVALUATOR,
  requirements: "0xabcd",
  metadataURL: "https://policy.example/kyc",
  retiredAt: 0n,
}

/**
 * decodeRequirements as the contract returns it: raw enum numbers. uniqueIdentifierType uses
 * the same numbering as the app-side NullifierType (1 = salted).
 */
const RAW_REQUIREMENTS = {
  uniqueIdentifierType: 1,
  enforceUniqueness: true,
  minAge: 18,
  sanctionsMode: 1,
  faceMatchMode: 2,
  includedNationalities: [],
  excludedNationalities: ["PRK"],
}

const SAMPLE_REQUIREMENTS: AttestPolicyRequirements = {
  uniqueIdentifierType: NullifierType.SALTED,
  enforceUniqueness: true,
  minAge: 18,
  sanctionsMode: "normal",
  facematchMode: "strict",
  includedNationalities: [],
  excludedNationalities: ["PRK"],
}

function stubClient(
  read: (params: { functionName: string; args?: readonly unknown[] }) => unknown,
) {
  const readCalls: { address: string; functionName: string; args?: readonly unknown[] }[] = []
  const logCalls: Record<string, unknown>[] = []
  const client = {
    readContract: async (params: never) => {
      const p = params as { address: string; functionName: string; args?: readonly unknown[] }
      readCalls.push(p)
      return read(p)
    },
    getLogs: async (params: never) => {
      logCalls.push(params as Record<string, unknown>)
      return []
    },
    getBlockNumber: async () => 100n,
  } as unknown as AttestReadClient
  return { client, readCalls, logCalls }
}

describe("AttestClient reads", () => {
  test("buildIssueCall assembles the registry call around the encoded proof data", async () => {
    const spy = spyOn(AttestClient, "getIssueProofData").mockReturnValue("0xf00d")
    try {
      const { client } = stubClient(() => null)
      const attest = new AttestClient({ client, address: REGISTRY })
      const call = attest.buildIssueCall({
        policyId: POLICY_ID,
        proof: { proof: "0x1" } as never,
        domain: "verify.zkpassport.id",
        scope: "attest:0x2a",
        devMode: true,
      })
      expect(call.address).toBe(REGISTRY)
      expect(call.functionName).toBe("issue")
      expect(call.args).toEqual([POLICY_ID, "0xf00d"])
      expect(spy.mock.calls[0][0]).toEqual({
        proof: { proof: "0x1" },
        domain: "verify.zkpassport.id",
        scope: "attest:0x2a",
        validityPeriodInSeconds: undefined,
        devMode: true,
      })
    } finally {
      spy.mockRestore()
    }
  })

  test("hasCredential is the expiry-masked balance check", async () => {
    let balance = 1n
    const { client } = stubClient(() => balance)
    const attest = new AttestClient({ client, address: REGISTRY })
    expect(await attest.hasCredential(WALLET, POLICY_ID)).toBe(true)
    balance = 0n
    expect(await attest.hasCredential(WALLET, POLICY_ID)).toBe(false)
  })

  test("getPolicy forwards args and returns the decoded policy", async () => {
    const { client, readCalls } = stubClient(() => SAMPLE_POLICY)
    const attest = new AttestClient({ client, address: REGISTRY })
    const policy = await attest.getPolicy(POLICY_ID)
    expect(policy).toEqual(SAMPLE_POLICY)
    expect(readCalls[0].address).toBe(REGISTRY)
    expect(readCalls[0].functionName).toBe("getPolicy")
    expect(readCalls[0].args).toEqual([POLICY_ID])
  })

  test("getRequirements decodes through the policy's evaluator", async () => {
    const { client, readCalls } = stubClient((p) => {
      if (p.functionName === "schemaVersion") return 1n
      if (p.functionName === "decodeRequirements") return RAW_REQUIREMENTS
      throw new Error(`unexpected read ${p.functionName}`)
    })
    const attest = new AttestClient({ client, address: REGISTRY })
    const requirements = await attest.getRequirements(SAMPLE_POLICY)
    expect(requirements).toEqual(SAMPLE_REQUIREMENTS)
    expect(readCalls[0].address).toBe(EVALUATOR)
    expect(readCalls[0].functionName).toBe("schemaVersion")
    expect(readCalls[1].address).toBe(EVALUATOR)
    expect(readCalls[1].args).toEqual(["0xabcd"])
  })

  test("getRequirements passes nullifier types through untranslated, mock and NONE included", async () => {
    for (const raw of [NullifierType.SALTED_MOCK, NullifierType.NONE]) {
      const { client } = stubClient((p) => {
        if (p.functionName === "schemaVersion") return 1n
        if (p.functionName === "decodeRequirements")
          return { ...RAW_REQUIREMENTS, uniqueIdentifierType: raw, enforceUniqueness: false }
        throw new Error(`unexpected read ${p.functionName}`)
      })
      const attest = new AttestClient({ client, address: REGISTRY })
      const requirements = await attest.getRequirements(SAMPLE_POLICY)
      expect(requirements.uniqueIdentifierType).toBe(raw)
    }
  })

  test("getRequirements rejects unknown evaluator schemas", async () => {
    const { client } = stubClient(() => 2n)
    const attest = new AttestClient({ client, address: REGISTRY })
    await expect(attest.getRequirements(SAMPLE_POLICY)).rejects.toThrow(
      "Unsupported policy evaluator schema",
    )
  })

  test("uri, balanceOf, heldUntil, banned, policyScope forward the right calls", async () => {
    const results: Record<string, unknown> = {
      uri: "https://policy.example/kyc",
      balanceOf: 1n,
      heldUntil: 1702592000n,
      banned: true,
      policyScope: "attest:0x000000000000000000000000000000000000000000000000000000000000002a",
    }
    const { client, readCalls } = stubClient((p) => results[p.functionName])
    const attest = new AttestClient({ client, address: REGISTRY })
    expect(await attest.uri(POLICY_ID)).toBe(results.uri as string)
    expect(await attest.balanceOf(WALLET, POLICY_ID)).toBe(1n)
    expect(await attest.heldUntil(WALLET, POLICY_ID)).toBe(1702592000n)
    expect(await attest.banned(WALLET, POLICY_ID)).toBe(true)
    expect(await attest.policyScope(POLICY_ID)).toBe(results.policyScope as string)
    expect(readCalls.map((c) => c.functionName)).toEqual([
      "uri",
      "balanceOf",
      "heldUntil",
      "banned",
      "policyScope",
    ])
    expect(readCalls[1].args).toEqual([WALLET, POLICY_ID])
    expect(readCalls[2].args).toEqual([WALLET, POLICY_ID])
    expect(readCalls[3].args).toEqual([WALLET, POLICY_ID])
  })
})

describe("AttestClient discovery", () => {
  test("listPolicies maps PolicyCreated logs and forwards the owner filter", async () => {
    const { client, logCalls } = stubClient(() => SAMPLE_POLICY)
    ;(client as { getLogs: unknown }).getLogs = async (params: never) => {
      logCalls.push(params as Record<string, unknown>)
      return [{ args: { policyId: POLICY_ID, owner: WALLET } }] as never
    }
    const attest = new AttestClient({ client, address: REGISTRY })
    const policies = await attest.listPolicies({ owner: WALLET, fromBlock: 5n, toBlock: 90n })
    expect(policies).toEqual([{ policyId: POLICY_ID, owner: WALLET }])
    const call = logCalls[0] as { address: string; args?: { owner?: string }; fromBlock?: bigint }
    expect(call.address).toBe(REGISTRY)
    expect(call.args?.owner).toBe(WALLET)
    expect(call.fromBlock).toBe(5n)
  })

  test("listPolicies throws without fromBlock or deployBlock", async () => {
    const { client } = stubClient(() => SAMPLE_POLICY)
    const attest = new AttestClient({ client, address: REGISTRY })
    await expect(attest.listPolicies()).rejects.toThrow("needs a starting block")
  })

  test("listPolicies starts at the client's deployBlock and ends at the current block", async () => {
    const { client, logCalls } = stubClient(() => SAMPLE_POLICY)
    const attest = new AttestClient({ client, address: REGISTRY, deployBlock: 40n })
    await attest.listPolicies()
    const call = logCalls[0] as { args?: unknown; fromBlock?: bigint; toBlock?: bigint }
    expect(call.args).toBeUndefined()
    expect(call.fromBlock).toBe(40n)
    expect(call.toBlock).toBe(100n)
  })

  test("listPolicies chunks the scan into blockRange windows and aggregates results", async () => {
    const { client, logCalls } = stubClient(() => SAMPLE_POLICY)
    ;(client as { getLogs: unknown }).getLogs = async (params: never) => {
      const p = params as { fromBlock: bigint }
      logCalls.push(params as Record<string, unknown>)
      return [{ args: { policyId: p.fromBlock, owner: WALLET } }] as never
    }
    const attest = new AttestClient({ client, address: REGISTRY })
    const policies = await attest.listPolicies({ fromBlock: 0n, toBlock: 25n, blockRange: 10n })
    expect(logCalls.map((c) => [c.fromBlock, c.toBlock])).toEqual([
      [0n, 9n],
      [10n, 19n],
      [20n, 25n],
    ])
    expect(policies).toEqual([
      { policyId: 0n, owner: WALLET },
      { policyId: 10n, owner: WALLET },
      { policyId: 20n, owner: WALLET },
    ])
  })
})

describe("AttestClient issue helpers", () => {
  test("getIssueDetails returns address, function name, and the attest ABI", () => {
    const { client } = stubClient(() => SAMPLE_POLICY)
    const attest = new AttestClient({ client, address: REGISTRY })
    const details = attest.getIssueDetails()
    expect(details.address).toBe(REGISTRY)
    expect(details.functionName).toBe("issue")
    expect(details.abi.some((e) => e.type === "function" && e.name === "issue")).toBe(true)
  })

  test("getIssueProofData abi-encodes the verifier parameters per the evaluator schema", () => {
    const verifierParams = {
      version: "0x0000000000000000000000000000000000000000000000000000000000000001",
      proofVerificationData: {
        vkeyHash: "0x00000000000000000000000000000000000000000000000000000000000000aa",
        proof: "0xdeadbeef",
        publicInputs: ["0x00000000000000000000000000000000000000000000000000000000000000bb"],
      },
      committedInputs: "0x1234",
      serviceConfig: {
        validityPeriodInSeconds: 3600,
        domain: "demo.example.com",
        scope: "attest:0x000000000000000000000000000000000000000000000000000000000000002a",
        devMode: false,
      },
    } as const
    const spy = spyOn(SolidityVerifier, "getParameters").mockReturnValue(verifierParams as never)
    try {
      const proof = { proof: "0xdeadbeef", version: "0.21.0", name: "outer_evm_5" } as never
      const proofData = AttestClient.getIssueProofData({
        proof,
        domain: "demo.example.com",
        scope: "attest:0x000000000000000000000000000000000000000000000000000000000000002a",
        validityPeriodInSeconds: 3600,
        devMode: false,
      })

      // The bytes must decode back through the evaluator's own decodeProofData layout.
      const proofDataAbi = getAbiItem({
        abi: PolicyEvaluatorV1Abi,
        name: "decodeProofData",
      }).outputs
      const [decoded] = decodeAbiParameters(proofDataAbi, proofData)
      expect(decoded.version).toBe(verifierParams.version)
      expect(decoded.proofVerificationData).toEqual(verifierParams.proofVerificationData)
      expect(decoded.committedInputs).toBe("0x1234")
      expect(decoded.serviceConfig).toEqual({
        ...verifierParams.serviceConfig,
        validityPeriodInSeconds: 3600n,
      })
    } finally {
      spy.mockRestore()
    }
  })
})

test("AttestClient is exported from the package entrypoint", async () => {
  const pkg = await import("../src/index")
  expect(pkg.AttestClient).toBe(AttestClient)
})

describe("buildAttestProofRequest", () => {
  function requestStub(requirements: Partial<typeof RAW_REQUIREMENTS> = {}) {
    return stubClient((p) => {
      if (p.functionName === "getPolicy") return SAMPLE_POLICY
      if (p.functionName === "policyScope") return "attest:0x2a"
      if (p.functionName === "domain") return "verify.zkpassport.id"
      if (p.functionName === "schemaVersion") return 1n
      if (p.functionName === "decodeRequirements") return { ...RAW_REQUIREMENTS, ...requirements }
      throw new Error(`unexpected read ${p.functionName}`)
    })
  }

  function fakeQueryBuilder() {
    const calls: { method: string; args: unknown[] }[] = []
    const qb: Record<string, unknown> = {}
    for (const method of ["gte", "in", "out", "sanctions", "facematch", "bind"]) {
      qb[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return qb
      }
    }
    qb.done = () => {
      calls.push({ method: "done", args: [] })
      return { url: "https://request.example" }
    }
    return { qb: qb as never, calls }
  }

  const MINT = {
    policyId: POLICY_ID,
    wallet: WALLET,
    chain: "ethereum_sepolia",
  } as const

  test("reads scope and domain on-chain and applies predicates, facematch, and bindings", async () => {
    const { client } = requestStub({ minAge: 18, excludedNationalities: ["PRK"] })
    const attest = new AttestClient({ client, address: REGISTRY })
    const request = await buildAttestProofRequest(attest, MINT)
    expect(request.scope).toBe("attest:0x2a")
    expect(request.domain).toBe("verify.zkpassport.id")
    expect(request.uniqueIdentifierType).toBe(NullifierType.SALTED)

    const { qb, calls } = fakeQueryBuilder()
    request.query(qb)
    expect(calls).toEqual([
      { method: "gte", args: ["age", 18] },
      { method: "out", args: ["nationality", ["PRK"]] },
      { method: "sanctions", args: ["all", "all", { strict: false }] },
      // Salted nullifiers force strict facematch regardless of the policy's mode.
      { method: "facematch", args: ["strict"] },
      { method: "bind", args: ["user_address", WALLET] },
      { method: "bind", args: ["chain", "ethereum_sepolia"] },
      { method: "done", args: [] },
    ])
  })

  test("NONE leaves the request unconstrained", async () => {
    const { client } = requestStub({
      uniqueIdentifierType: NullifierType.NONE,
      enforceUniqueness: false,
    })
    const attest = new AttestClient({ client, address: REGISTRY })
    const request = await buildAttestProofRequest(attest, MINT)
    expect(request.uniqueIdentifierType).toBeUndefined()
  })

  test("rejects policies requiring mock nullifier types — no mock/real mapping", async () => {
    for (const raw of [NullifierType.SALTED_MOCK, NullifierType.NON_SALTED_MOCK]) {
      const { client } = requestStub({ uniqueIdentifierType: raw })
      const attest = new AttestClient({ client, address: REGISTRY })
      await expect(buildAttestProofRequest(attest, MINT)).rejects.toThrow(
        "requires a mock nullifier type and cannot be minted",
      )
    }
  })

  test("rejects retired policies before any proof request", async () => {
    const { client } = stubClient((p) => {
      if (p.functionName === "getPolicy") return { ...SAMPLE_POLICY, retiredAt: 1700000000n }
      if (p.functionName === "policyScope") return "attest:0x2a"
      if (p.functionName === "domain") return "verify.zkpassport.id"
      throw new Error(`unexpected read ${p.functionName}`)
    })
    const attest = new AttestClient({ client, address: REGISTRY })
    await expect(buildAttestProofRequest(attest, MINT)).rejects.toThrow(
      "retired and no longer issues credentials",
    )
  })
})

describe("attest deployments", () => {
  test("maps supported chains to viem configs and rejects the rest", async () => {
    const { getAttestChain } = await import("../src/attest/deployments")
    expect(getAttestChain("ethereum_sepolia").id).toBe(11155111)
    expect(getAttestChain("local").id).toBe(31337)
    expect(() => getAttestChain("base")).toThrow("not supported")
  })

  test("resolves canonical registries and rejects chains without one", async () => {
    const { getAttestRegistry } = await import("../src/attest/deployments")
    expect(getAttestRegistry("ethereum_sepolia")).toBe("0x3278117D873965036B5e0007112ADDd488Bde3e1")
    expect(() => getAttestRegistry("local")).toThrow(
      "Attestation minting is not supported on 'local': no registry is deployed.",
    )
  })
})

describe("createAttestContext", () => {
  test("binds an AttestClient to the chain's canonical registry", () => {
    const ctx = createAttestContext(sepolia)
    expect(ctx.attest.address).toBe("0x3278117D873965036B5e0007112ADDd488Bde3e1")
    expect(ctx.chain).toBe(sepolia)
  })

  test("rejects chains without a recorded registry deployment", () => {
    expect(() => createAttestContext({ ...sepolia, id: 1, name: "Ethereum" })).toThrow(
      "Attestation minting is not supported on 'ethereum': no registry is deployed.",
    )
  })
})

function fakeContext(status: "success" | "reverted") {
  const writes: unknown[] = []
  const ctx = {
    chain: sepolia,
    publicClient: { waitForTransactionReceipt: async () => ({ status }) },
    attest: null,
  } as unknown as AttestContext
  const wallet = {
    account: WALLET,
    client: {
      writeContract: async (params: unknown) => {
        writes.push(params)
        return "0xhash"
      },
    },
  } as never
  return { ctx, wallet, writes }
}

describe("submitIssueCall", () => {
  const CALL = {
    address: REGISTRY,
    functionName: "issue",
    abi: [],
    args: [POLICY_ID, "0xf00d"],
  } as const

  test("submits through the wallet client and resolves on inclusion", async () => {
    const { ctx, wallet, writes } = fakeContext("success")
    const submitted: string[] = []
    const hash = await submitIssueCall(ctx, CALL, wallet, (h) => submitted.push(h))
    expect(hash).toBe("0xhash")
    expect(submitted).toEqual(["0xhash"])
    expect(writes).toEqual([
      {
        address: REGISTRY,
        abi: [],
        functionName: "issue",
        args: [POLICY_ID, "0xf00d"],
        account: WALLET,
        chain: sepolia,
      },
    ])
  })

  test("throws when the transaction reverts", async () => {
    const { ctx, wallet } = fakeContext("reverted")
    await expect(submitIssueCall(ctx, CALL, wallet)).rejects.toThrow(
      "Credential mint reverted (tx 0xhash).",
    )
  })
})

const SALT = "0x0000000000000000000000000000000000000000000000000000000000000007" as const

const REQUIREMENTS_ABI = getAbiItem({
  abi: PolicyEvaluatorV1Abi,
  name: "decodeRequirements",
}).outputs

describe("encodeAttestPolicyRequirements", () => {
  test("round-trips through the evaluator's schema-1 layout", () => {
    const encoded = encodeAttestPolicyRequirements(SAMPLE_REQUIREMENTS)
    const [decoded] = decodeAbiParameters(REQUIREMENTS_ABI, encoded)
    expect(decoded).toEqual({
      ...RAW_REQUIREMENTS,
      includedNationalities: [],
      excludedNationalities: ["PRK"],
    })
  })

  test("encodes absent sanctions and facematch modes as NONE", () => {
    const encoded = encodeAttestPolicyRequirements({
      ...SAMPLE_REQUIREMENTS,
      sanctionsMode: undefined,
      facematchMode: undefined,
    })
    const [decoded] = decodeAbiParameters(REQUIREMENTS_ABI, encoded)
    expect(decoded.sanctionsMode).toBe(0)
    expect(decoded.faceMatchMode).toBe(0)
  })
})

describe("computePolicyId", () => {
  test("matches the contract's keccak256(abi.encode(creator, salt))", () => {
    // Pinned from `cast keccak $(cast abi-encode "f(address,bytes32)" <WALLET> <SALT>)`.
    expect(computePolicyId(WALLET, SALT)).toBe(
      BigInt("0x1a5bebf306955e90264bb0e0979d31084dac4a68dd7e7a845240a2890b6954bb"),
    )
  })
})

describe("AttestClient owner calls", () => {
  const attest = new AttestClient({ client: stubClient(() => null).client, address: REGISTRY })

  test("buildCreatePolicyCall encodes requirements and defaults the flags to false", () => {
    const call = attest.buildCreatePolicyCall({
      salt: SALT,
      requirements: SAMPLE_REQUIREMENTS,
      credentialDuration: 2592000n,
      metadataURL: "https://policy.example/kyc",
    })
    expect(call.address).toBe(REGISTRY)
    expect(call.functionName).toBe("createPolicy")
    expect(call.args).toEqual([
      SALT,
      encodeAttestPolicyRequirements(SAMPLE_REQUIREMENTS),
      2592000n,
      "https://policy.example/kyc",
      false,
      false,
      false,
    ])
  })

  test("buildCreatePolicyCall forwards explicit owner-privilege flags", () => {
    const call = attest.buildCreatePolicyCall({
      salt: SALT,
      requirements: SAMPLE_REQUIREMENTS,
      credentialDuration: 1n,
      metadataURL: "",
      ownerIssuable: true,
      ownerBannable: true,
      ownerEditable: true,
    })
    expect(call.args.slice(4)).toEqual([true, true, true])
  })

  test("buildSetRequirementsCall pairs the policy id with re-encoded requirements", () => {
    const call = attest.buildSetRequirementsCall(POLICY_ID, SAMPLE_REQUIREMENTS)
    expect(call.functionName).toBe("setRequirements")
    expect(call.args).toEqual([POLICY_ID, encodeAttestPolicyRequirements(SAMPLE_REQUIREMENTS)])
  })

  test("the remaining owner calls mirror the contract signatures", () => {
    expect(attest.buildSetMetadataURLCall(POLICY_ID, "https://p.example/2")).toMatchObject({
      address: REGISTRY,
      functionName: "setMetadataURL",
      args: [POLICY_ID, "https://p.example/2"],
    })
    expect(attest.buildRetireCall(POLICY_ID)).toMatchObject({
      functionName: "retire",
      args: [POLICY_ID],
    })
    expect(attest.buildOwnerIssueCall(WALLET, POLICY_ID)).toMatchObject({
      functionName: "ownerIssue",
      args: [WALLET, POLICY_ID],
    })
    expect(attest.buildRenounceCall(POLICY_ID)).toMatchObject({
      functionName: "renounce",
      args: [POLICY_ID],
    })
    expect(attest.buildBanCall(WALLET, POLICY_ID)).toMatchObject({
      functionName: "ban",
      args: [WALLET, POLICY_ID],
    })
    expect(attest.buildUnbanCall(WALLET, POLICY_ID)).toMatchObject({
      functionName: "unban",
      args: [WALLET, POLICY_ID],
    })
  })
})

describe("submitAttestCall", () => {
  test("submits through the wallet client and resolves on inclusion", async () => {
    const { ctx, wallet, writes } = fakeContext("success")
    const attest = new AttestClient({ client: stubClient(() => null).client, address: REGISTRY })
    const call = attest.buildRetireCall(POLICY_ID)
    const submitted: string[] = []
    const hash = await submitAttestCall(ctx, call, wallet, (h) => submitted.push(h))
    expect(hash).toBe("0xhash")
    expect(submitted).toEqual(["0xhash"])
    expect(writes).toEqual([
      {
        address: REGISTRY,
        abi: call.abi,
        functionName: "retire",
        args: [POLICY_ID],
        account: WALLET,
        chain: sepolia,
      },
    ])
  })

  test("names the reverted function in the error", async () => {
    const { ctx, wallet } = fakeContext("reverted")
    const attest = new AttestClient({ client: stubClient(() => null).client, address: REGISTRY })
    await expect(
      submitAttestCall(ctx, attest.buildUnbanCall(WALLET, POLICY_ID), wallet),
    ).rejects.toThrow("unban transaction reverted (tx 0xhash).")
  })
})
