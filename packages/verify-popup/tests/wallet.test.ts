import { describe, expect, test } from "bun:test"
import type { WalletClient } from "viem"
import {
  buildWalletSetup,
  ensureWalletChain,
  selectWallets,
  walletConnectProjectId,
  type ConnectedWallet,
} from "../src/wallet"
import { resolveAttestChain } from "../src/chains"

describe("walletConnectProjectId", () => {
  test("reads a non-empty id from the env", () => {
    expect(walletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: "abc123" })).toBe("abc123")
  })

  test("treats missing or empty values as unconfigured", () => {
    expect(walletConnectProjectId({})).toBeUndefined()
    expect(walletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: "" })).toBeUndefined()
    expect(walletConnectProjectId({ VITE_WALLETCONNECT_PROJECT_ID: 42 })).toBeUndefined()
  })
})

describe("selectWallets", () => {
  test("falls back to injected-only when no project id is configured", () => {
    const selection = selectWallets(undefined)
    expect(selection.injectedOnly).toBe(true)
    expect(selection.projectId.length).toBeGreaterThan(0)
  })

  test("enables the full wallet set with a project id", () => {
    expect(selectWallets("abc123")).toEqual({ projectId: "abc123", injectedOnly: false })
  })
})

describe("buildWalletSetup", () => {
  test("configures wagmi for the resolved chain, honoring an RPC override", () => {
    const chain = resolveAttestChain("ethereum_sepolia", "http://localhost:8545")
    const setup = buildWalletSetup(chain, "abc123")
    expect(setup.injectedOnly).toBe(false)
    expect(setup.config.chains.map((c) => c.id)).toEqual([chain.id])
    expect(setup.config.chains[0].rpcUrls.default.http[0]).toBe("http://localhost:8545")
  })
})

describe("ensureWalletChain", () => {
  const chain = resolveAttestChain("ethereum_sepolia")

  function stubWallet(behavior: {
    switchChain: (calls: number) => Promise<void>
  }): ConnectedWallet & { calls: string[] } {
    const calls: string[] = []
    let switches = 0
    const client = {
      switchChain: () => {
        calls.push("switchChain")
        return behavior.switchChain(++switches)
      },
      addChain: () => {
        calls.push("addChain")
        return Promise.resolve()
      },
    } as unknown as WalletClient
    return { account: "0x2222222222222222222222222222222222222222", client, calls }
  }

  test("adds the chain only when the wallet does not recognize it (4902)", async () => {
    const wallet = stubWallet({
      switchChain: (calls) =>
        calls === 1
          ? Promise.reject(Object.assign(new Error("no chain"), { code: 4902 }))
          : Promise.resolve(),
    })
    await ensureWalletChain(wallet, chain)
    expect(wallet.calls).toEqual(["switchChain", "addChain", "switchChain"])
  })

  test("finds 4902 on a wrapped error's cause chain", async () => {
    const wrapped = new Error("switch failed")
    ;(wrapped as { cause?: unknown }).cause = { code: 4902 }
    const wallet = stubWallet({
      switchChain: (calls) => (calls === 1 ? Promise.reject(wrapped) : Promise.resolve()),
    })
    await ensureWalletChain(wallet, chain)
    expect(wallet.calls).toEqual(["switchChain", "addChain", "switchChain"])
  })

  test("rethrows a user rejection without prompting to add the chain", async () => {
    const rejection = Object.assign(new Error("User rejected the request."), { code: 4001 })
    const wallet = stubWallet({ switchChain: () => Promise.reject(rejection) })
    await expect(ensureWalletChain(wallet, chain)).rejects.toThrow("User rejected the request.")
    expect(wallet.calls).toEqual(["switchChain"])
  })
})
