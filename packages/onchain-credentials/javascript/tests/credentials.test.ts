import { describe, expect, test } from "bun:test"
import { decodeAbiParameters, getAbiItem } from "viem"
import { NullifierType } from "@zkpassport/utils"
import { PolicyEvaluatorV1Abi } from "../src/abi/policy-evaluator-v1"
import { sepolia } from "viem/chains"
import {
  CredentialsClient,
  computePolicyId,
  createCredentialsContext,
  encodeCredentialPolicyRequirements,
  submitCredentialsCall,
  submitIssueCall,
  type CredentialsContext,
  type CredentialPolicy,
  type CredentialPolicyRequirements,
  type CredentialsReadClient,
} from "../src"

const REGISTRY = "0x1111111111111111111111111111111111111111" as const
const WALLET = "0x2222222222222222222222222222222222222222" as const
const POLICY_ID = 42n

const VERIFIER_PARAMS = {
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

const EVALUATOR = "0x3333333333333333333333333333333333333333" as const

const SAMPLE_POLICY: CredentialPolicy = {
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

const SAMPLE_REQUIREMENTS: CredentialPolicyRequirements = {
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
  } as unknown as CredentialsReadClient
  return { client, readCalls, logCalls }
}

describe("CredentialsClient reads", () => {
  test("buildIssueCall assembles the registry call around the encoded proof data", async () => {
    const { client } = stubClient(() => null)
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    const call = credentials.buildIssueCall({ policyId: POLICY_ID, params: VERIFIER_PARAMS })
    expect(call.address).toBe(REGISTRY)
    expect(call.functionName).toBe("issue")
    expect(call.args).toEqual([POLICY_ID, CredentialsClient.getIssueProofData(VERIFIER_PARAMS)])
  })

  test("hasCredential is the expiry-masked balance check", async () => {
    let balance = 1n
    const { client } = stubClient(() => balance)
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    expect(await credentials.hasCredential(WALLET, POLICY_ID)).toBe(true)
    balance = 0n
    expect(await credentials.hasCredential(WALLET, POLICY_ID)).toBe(false)
  })

  test("getPolicy forwards args and returns the decoded policy", async () => {
    const { client, readCalls } = stubClient(() => SAMPLE_POLICY)
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    const policy = await credentials.getPolicy(POLICY_ID)
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
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    const requirements = await credentials.getRequirements(SAMPLE_POLICY)
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
      const credentials = new CredentialsClient({ client, address: REGISTRY })
      const requirements = await credentials.getRequirements(SAMPLE_POLICY)
      expect(requirements.uniqueIdentifierType).toBe(raw)
    }
  })

  test("getRequirements rejects unknown evaluator schemas", async () => {
    const { client } = stubClient(() => 2n)
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    await expect(credentials.getRequirements(SAMPLE_POLICY)).rejects.toThrow(
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
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    expect(await credentials.uri(POLICY_ID)).toBe(results.uri as string)
    expect(await credentials.balanceOf(WALLET, POLICY_ID)).toBe(1n)
    expect(await credentials.heldUntil(WALLET, POLICY_ID)).toBe(1702592000n)
    expect(await credentials.banned(WALLET, POLICY_ID)).toBe(true)
    expect(await credentials.policyScope(POLICY_ID)).toBe(results.policyScope as string)
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

describe("CredentialsClient discovery", () => {
  test("listPolicies maps PolicyCreated logs and forwards the owner filter", async () => {
    const { client, logCalls } = stubClient(() => SAMPLE_POLICY)
    ;(client as { getLogs: unknown }).getLogs = async (params: never) => {
      logCalls.push(params as Record<string, unknown>)
      return [{ args: { policyId: POLICY_ID, owner: WALLET } }] as never
    }
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    const policies = await credentials.listPolicies({ owner: WALLET, fromBlock: 5n, toBlock: 90n })
    expect(policies).toEqual([{ policyId: POLICY_ID, owner: WALLET }])
    const call = logCalls[0] as { address: string; args?: { owner?: string }; fromBlock?: bigint }
    expect(call.address).toBe(REGISTRY)
    expect(call.args?.owner).toBe(WALLET)
    expect(call.fromBlock).toBe(5n)
  })

  test("listPolicies throws without fromBlock or deployBlock", async () => {
    const { client } = stubClient(() => SAMPLE_POLICY)
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    await expect(credentials.listPolicies()).rejects.toThrow("needs a starting block")
  })

  test("listPolicies starts at the client's deployBlock and ends at the current block", async () => {
    const { client, logCalls } = stubClient(() => SAMPLE_POLICY)
    const credentials = new CredentialsClient({ client, address: REGISTRY, deployBlock: 40n })
    await credentials.listPolicies()
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
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    const policies = await credentials.listPolicies({
      fromBlock: 0n,
      toBlock: 25n,
      blockRange: 10n,
    })
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

describe("CredentialsClient issue helpers", () => {
  test("getIssueDetails returns address, function name, and the credentials ABI", () => {
    const { client } = stubClient(() => SAMPLE_POLICY)
    const credentials = new CredentialsClient({ client, address: REGISTRY })
    const details = credentials.getIssueDetails()
    expect(details.address).toBe(REGISTRY)
    expect(details.functionName).toBe("issue")
    expect(details.abi.some((e) => e.type === "function" && e.name === "issue")).toBe(true)
  })

  test("getIssueProofData abi-encodes the verifier parameters per the evaluator schema", () => {
    const proofData = CredentialsClient.getIssueProofData(VERIFIER_PARAMS)

    // The bytes must decode back through the evaluator's own decodeProofData layout.
    const proofDataAbi = getAbiItem({
      abi: PolicyEvaluatorV1Abi,
      name: "decodeProofData",
    }).outputs
    const [decoded] = decodeAbiParameters(proofDataAbi, proofData)
    expect(decoded.version).toBe(VERIFIER_PARAMS.version)
    expect(decoded.proofVerificationData).toEqual(VERIFIER_PARAMS.proofVerificationData)
    expect(decoded.committedInputs).toBe("0x1234")
    expect(decoded.serviceConfig).toEqual({
      ...VERIFIER_PARAMS.serviceConfig,
      validityPeriodInSeconds: 3600n,
    })
  })
})

describe("credentials deployments", () => {
  test("maps supported chains to viem configs and rejects the rest", async () => {
    const { getCredentialsChain } = await import("../src/deployments")
    expect(getCredentialsChain("ethereum_sepolia").id).toBe(11155111)
    expect(getCredentialsChain("local").id).toBe(31337)
    expect(() => getCredentialsChain("base")).toThrow("not supported")
  })

  test("resolves canonical registries and rejects chains without one", async () => {
    const { getCredentialsRegistry } = await import("../src/deployments")
    expect(getCredentialsRegistry("ethereum_sepolia")).toBe(
      "0x3278117D873965036B5e0007112ADDd488Bde3e1",
    )
    expect(() => getCredentialsRegistry("local")).toThrow(
      "Credential minting is not supported on 'local': no registry is deployed.",
    )
  })
})

describe("createCredentialsContext", () => {
  test("binds a CredentialsClient to the chain's canonical registry", () => {
    const ctx = createCredentialsContext(sepolia)
    expect(ctx.credentials.address).toBe("0x3278117D873965036B5e0007112ADDd488Bde3e1")
    expect(ctx.chain).toBe(sepolia)
  })

  test("rejects chains without a recorded registry deployment", () => {
    expect(() => createCredentialsContext({ ...sepolia, id: 1, name: "Ethereum" })).toThrow(
      "Credential minting is not supported on 'ethereum': no registry is deployed.",
    )
  })
})

function fakeContext(status: "success" | "reverted") {
  const writes: unknown[] = []
  const ctx = {
    chain: sepolia,
    publicClient: { waitForTransactionReceipt: async () => ({ status }) },
    credentials: null,
  } as unknown as CredentialsContext
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

describe("encodeCredentialPolicyRequirements", () => {
  test("round-trips through the evaluator's schema-1 layout", () => {
    const encoded = encodeCredentialPolicyRequirements(SAMPLE_REQUIREMENTS)
    const [decoded] = decodeAbiParameters(REQUIREMENTS_ABI, encoded)
    expect(decoded).toEqual({
      ...RAW_REQUIREMENTS,
      includedNationalities: [],
      excludedNationalities: ["PRK"],
    })
  })

  test("encodes absent sanctions and facematch modes as NONE", () => {
    const encoded = encodeCredentialPolicyRequirements({
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

describe("CredentialsClient owner calls", () => {
  const credentials = new CredentialsClient({
    client: stubClient(() => null).client,
    address: REGISTRY,
  })

  test("buildCreatePolicyCall encodes requirements and defaults the flags to false", () => {
    const call = credentials.buildCreatePolicyCall({
      salt: SALT,
      requirements: SAMPLE_REQUIREMENTS,
      credentialDuration: 2592000n,
      metadataURL: "https://policy.example/kyc",
    })
    expect(call.address).toBe(REGISTRY)
    expect(call.functionName).toBe("createPolicy")
    expect(call.args).toEqual([
      SALT,
      encodeCredentialPolicyRequirements(SAMPLE_REQUIREMENTS),
      2592000n,
      "https://policy.example/kyc",
      false,
      false,
      false,
    ])
  })

  test("buildCreatePolicyCall forwards explicit owner-privilege flags", () => {
    const call = credentials.buildCreatePolicyCall({
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
    const call = credentials.buildSetRequirementsCall(POLICY_ID, SAMPLE_REQUIREMENTS)
    expect(call.functionName).toBe("setRequirements")
    expect(call.args).toEqual([POLICY_ID, encodeCredentialPolicyRequirements(SAMPLE_REQUIREMENTS)])
  })

  test("the remaining owner calls mirror the contract signatures", () => {
    expect(credentials.buildSetMetadataURLCall(POLICY_ID, "https://p.example/2")).toMatchObject({
      address: REGISTRY,
      functionName: "setMetadataURL",
      args: [POLICY_ID, "https://p.example/2"],
    })
    expect(credentials.buildRetireCall(POLICY_ID)).toMatchObject({
      functionName: "retire",
      args: [POLICY_ID],
    })
    expect(credentials.buildOwnerIssueCall(WALLET, POLICY_ID)).toMatchObject({
      functionName: "ownerIssue",
      args: [WALLET, POLICY_ID],
    })
    expect(credentials.buildRenounceCall(POLICY_ID)).toMatchObject({
      functionName: "renounce",
      args: [POLICY_ID],
    })
    expect(credentials.buildBanCall(WALLET, POLICY_ID)).toMatchObject({
      functionName: "ban",
      args: [WALLET, POLICY_ID],
    })
    expect(credentials.buildUnbanCall(WALLET, POLICY_ID)).toMatchObject({
      functionName: "unban",
      args: [WALLET, POLICY_ID],
    })
  })
})

describe("submitCredentialsCall", () => {
  test("submits through the wallet client and resolves on inclusion", async () => {
    const { ctx, wallet, writes } = fakeContext("success")
    const credentials = new CredentialsClient({
      client: stubClient(() => null).client,
      address: REGISTRY,
    })
    const call = credentials.buildRetireCall(POLICY_ID)
    const submitted: string[] = []
    const hash = await submitCredentialsCall(ctx, call, wallet, (h) => submitted.push(h))
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
    const credentials = new CredentialsClient({
      client: stubClient(() => null).client,
      address: REGISTRY,
    })
    await expect(
      submitCredentialsCall(ctx, credentials.buildUnbanCall(WALLET, POLICY_ID), wallet),
    ).rejects.toThrow("unban transaction reverted (tx 0xhash).")
  })
})
