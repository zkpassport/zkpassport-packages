import { describe, expect, test } from "bun:test"
import { buildWalletSetup, selectWallets, walletConnectProjectId } from "../src/wallet"
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
