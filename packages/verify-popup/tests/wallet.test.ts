import { describe, expect, test } from "bun:test"
import { buildWalletConfig } from "../src/mint/wagmi"
import { resolveCredentialsChain } from "../src/mint/wagmi"

describe("buildWalletConfig", () => {
  test("configures wagmi for the resolved chain, honoring an RPC override", () => {
    const chain = resolveCredentialsChain("ethereum_sepolia", "http://localhost:8545")
    const config = buildWalletConfig(chain)
    expect(config.chains.map((c) => c.id)).toEqual([chain.id])
    expect(config.chains[0].rpcUrls.default.http[0]).toBe("http://localhost:8545")
    expect(config.connectors.map((c) => c.id)).toEqual(["injected"])
  })
})
