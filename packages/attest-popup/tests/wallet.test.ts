import { describe, expect, test } from "bun:test"
import { connectWallet, onAccountsChanged, type Eip1193Provider } from "../lib/wallet"
import { resolveChain } from "../lib/chains"

const ACCOUNT = "0x1111111111111111111111111111111111111111"

function fakeProvider() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  const provider: Eip1193Provider = {
    request: async ({ method }) => {
      if (method === "eth_requestAccounts") return [ACCOUNT]
      if (method === "eth_chainId") return "0x7a69"
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
    const wallet = await connectWallet(resolveChain("local"), provider)
    expect(wallet.account).toBe(ACCOUNT)
    expect(wallet.client.chain?.id).toBe(31337)
  })

  test("throws a descriptive error without a provider", async () => {
    await expect(connectWallet(resolveChain("local"), undefined)).rejects.toThrow(/wallet/i)
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
