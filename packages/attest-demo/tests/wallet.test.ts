import { describe, expect, test } from "bun:test"
import { connectWallet, onAccountsChanged, type Eip1193Provider } from "../lib/wallet"
import { resolveChain } from "../lib/chains"

const ACCOUNT = "0x1111111111111111111111111111111111111111"

function fakeProvider() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  const provider: Eip1193Provider = {
    request: async ({ method }) => {
      if (method === "eth_requestAccounts") return [ACCOUNT]
      if (method === "eth_chainId") return "0xaa36a7"
      return null
    },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = [...(listeners[event] ?? []), handler]
    },
    removeListener: (event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler)
    },
  }
  return { provider, listeners }
}

describe("connectWallet", () => {
  test("returns the first requested account", async () => {
    const { provider } = fakeProvider()
    const wallet = await connectWallet(resolveChain("ethereum_sepolia"), provider)
    expect(wallet.account).toBe(ACCOUNT)
    expect(wallet.client.chain?.id).toBe(11155111)
  })

  test("throws a descriptive error without a provider", async () => {
    await expect(connectWallet(resolveChain("ethereum_sepolia"), undefined)).rejects.toThrow(
      /wallet/i,
    )
  })
})

describe("onAccountsChanged", () => {
  test("subscribes and the cleanup unsubscribes", () => {
    const { provider, listeners } = fakeProvider()
    const handler = () => {}
    const cleanup = onAccountsChanged(handler, provider)
    expect(listeners["accountsChanged"]).toHaveLength(1)
    cleanup()
    expect(listeners["accountsChanged"]).toHaveLength(0)
  })

  test("is a no-op without a provider", () => {
    expect(onAccountsChanged(() => {}, undefined)).toBeInstanceOf(Function)
  })
})

import type { PublicClient, TransactionReceipt, WalletClient } from "viem"
import { deployAndWait, writeAndWait, type ConnectedWallet } from "../lib/wallet"

const CHAIN = resolveChain("ethereum_sepolia")
const TARGET = "0x2222222222222222222222222222222222222222" as const

function stubClients(receipt: Partial<TransactionReceipt>) {
  const recorded: { write?: unknown; deploy?: unknown } = {}
  const wallet: ConnectedWallet = {
    account: ACCOUNT as `0x${string}`,
    client: {
      writeContract: async (args: unknown) => {
        recorded.write = args
        return "0xhash"
      },
      deployContract: async (args: unknown) => {
        recorded.deploy = args
        return "0xhash"
      },
    } as unknown as WalletClient,
  }
  const publicClient = {
    waitForTransactionReceipt: async () => receipt,
  } as unknown as PublicClient
  return { wallet, publicClient, recorded }
}

describe("writeAndWait", () => {
  test("sends the request and returns the receipt", async () => {
    const { wallet, publicClient, recorded } = stubClients({ status: "success" })
    const receipt = await writeAndWait(wallet, publicClient, CHAIN, {
      address: TARGET,
      abi: [],
      functionName: "retire",
      args: [42n],
    })
    expect(receipt.status).toBe("success")
    expect((recorded.write as { functionName: string }).functionName).toBe("retire")
    expect((recorded.write as { args: unknown }).args).toEqual([42n])
  })

  test("throws naming the tx hash on revert", async () => {
    const { wallet, publicClient } = stubClients({ status: "reverted", transactionHash: "0xdead" })
    await expect(
      writeAndWait(wallet, publicClient, CHAIN, {
        address: TARGET,
        abi: [],
        functionName: "retire",
        args: [42n],
      }),
    ).rejects.toThrow(/0xdead/)
  })
})

describe("deployAndWait", () => {
  test("returns the deployed address from the receipt", async () => {
    const { wallet, publicClient, recorded } = stubClients({
      status: "success",
      contractAddress: TARGET,
    })
    const { address } = await deployAndWait(
      wallet,
      publicClient,
      CHAIN,
      { abi: [], bytecode: "0x6001" },
      [TARGET],
    )
    expect(address).toBe(TARGET)
    expect((recorded.deploy as { args: unknown }).args).toEqual([TARGET])
  })

  test("throws when the receipt has no contract address", async () => {
    const { wallet, publicClient } = stubClients({ status: "success" })
    await expect(
      deployAndWait(wallet, publicClient, CHAIN, { abi: [], bytecode: "0x6001" }, []),
    ).rejects.toThrow(/address/i)
  })
})
