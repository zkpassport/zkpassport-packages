import { describe, expect, test } from "bun:test"
import { AttestClient, type AttestPolicy } from "@zkpassport/sdk"
import type { AttestIssueCall } from "@zkpassport/ui"
import type { PublicClient, WalletClient } from "viem"
import { checkCredential, fetchPolicyView, submitIssue, type AttestContext } from "../lib/attest"
import { resolveChain } from "../lib/chains"
import type { ConnectedWallet } from "../lib/wallet"

const localChain = () => resolveChain("local")

const REGISTRY = "0x2222222222222222222222222222222222222222" as const
const WALLET = "0x3333333333333333333333333333333333333333" as const

const policy: AttestPolicy = {
  owner: "0x1111111111111111111111111111111111111111",
  validityPeriod: 0n,
  unique: false,
  saltedNullifierOnly: false,
  minAge: 18,
  sanctionsCheck: true,
  excludedCountries: [],
  metadataURL: "",
  hook: "0x4444444444444444444444444444444444444444",
  retiredAt: 0n,
}

function stubContext(handlers: {
  readContract: (args: { functionName: string; args?: readonly unknown[] }) => unknown
  waitForTransactionReceipt?: (args: { hash: `0x${string}` }) => unknown
}): AttestContext {
  const publicClient = {
    readContract: async (args: never) => handlers.readContract(args),
    getLogs: async () => [],
    waitForTransactionReceipt: async (args: never) => handlers.waitForTransactionReceipt?.(args),
  } as unknown as PublicClient
  return {
    publicClient,
    attest: new AttestClient({ client: publicClient, address: REGISTRY }),
  }
}

const issueCall = (ctx: AttestContext): AttestIssueCall => ({
  ...ctx.attest.getIssueDetails(),
  args: [WALLET, 42n, { vkeyHash: "0x" } as never] as const,
})

describe("fetchPolicyView", () => {
  test("returns the policy and the registry domain", async () => {
    const ctx = stubContext({
      readContract: ({ functionName }) =>
        functionName === "getPolicy" ? policy : "demo.zkpassport.id",
    })
    const view = await fetchPolicyView(ctx, 42n)
    expect(view.policy.minAge).toBe(18)
    expect(view.domain).toBe("demo.zkpassport.id")
  })
})

describe("checkCredential", () => {
  test("true while the wallet holds the credential", async () => {
    const ctx = stubContext({ readContract: () => 1n })
    expect(await checkCredential(ctx, WALLET, 42n)).toBe(true)
  })

  test("false when the balance is zero", async () => {
    const ctx = stubContext({ readContract: () => 0n })
    expect(await checkCredential(ctx, WALLET, 42n)).toBe(false)
  })
})

describe("submitIssue", () => {
  const receipt = { status: "success", transactionHash: "0xabc" }

  function stubWallet(recorded: { args?: unknown }): ConnectedWallet {
    return {
      account: WALLET,
      client: {
        writeContract: async (args: unknown) => {
          recorded.args = args
          return "0xabc"
        },
      } as unknown as WalletClient,
    }
  }

  test("sends the issue call verbatim and returns the receipt", async () => {
    const ctx = stubContext({
      readContract: () => 0n,
      waitForTransactionReceipt: () => receipt,
    })
    const recorded: { args?: { address?: string; functionName?: string; args?: unknown } } = {}
    const submitted: `0x${string}`[] = []
    const call = issueCall(ctx)
    const result = await submitIssue(ctx, stubWallet(recorded), localChain(), call, (hash) =>
      submitted.push(hash),
    )
    expect(result.transactionHash).toBe("0xabc")
    expect(submitted).toEqual(["0xabc"])
    expect(recorded.args?.address).toBe(REGISTRY)
    expect(recorded.args?.functionName).toBe("issue")
    expect(recorded.args?.args).toEqual(call.args)
  })

  test("rejects with the hash when the mint reverts", async () => {
    const ctx = stubContext({
      readContract: () => 0n,
      waitForTransactionReceipt: () => ({ status: "reverted", transactionHash: "0xabc" }),
    })
    await expect(submitIssue(ctx, stubWallet({}), localChain(), issueCall(ctx))).rejects.toThrow(
      /0xabc/,
    )
  })
})
