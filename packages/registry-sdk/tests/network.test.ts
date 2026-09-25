import { describe, expect, test } from "bun:test"
import { createRegistryClient, REGISTRY_NETWORK_CHAIN_IDS } from "../src"

describe("createRegistryClient", () => {
  test("maps each network to its chain", () => {
    expect(REGISTRY_NETWORK_CHAIN_IDS).toEqual({ mainnet: 1, testnet: 11155111, dev: 31337 })
    for (const network of ["mainnet", "testnet", "dev"] as const) {
      const client = createRegistryClient(network) as any
      expect(client.chainId).toBe(REGISTRY_NETWORK_CHAIN_IDS[network])
    }
  })

  test("uses the network's defaults when there are no overrides", () => {
    const client = createRegistryClient("dev") as any
    expect(client.rpcUrl).toBe("http://localhost:8545")
    expect(client.rootRegistry).toBe("0x5FbDB2315678afecb367f032d93F642f64180aa3")
  })

  test("overrides replace the network's defaults", () => {
    const packagedCircuitUrlGenerator = (_chainId: number, hash: string) =>
      `http://127.0.0.1:9/${hash}`
    const client = createRegistryClient("dev", {
      rpcUrl: "http://127.0.0.1:9545",
      rootRegistry: "0x0000000000000000000000000000000000000001",
      packagedCircuitUrlGenerator,
    }) as any
    expect(client.chainId).toBe(31337)
    expect(client.rpcUrl).toBe("http://127.0.0.1:9545")
    expect(client.rootRegistry).toBe("0x0000000000000000000000000000000000000001")
    expect(client.packagedCircuitUrlGenerator).toBe(packagedCircuitUrlGenerator)
  })

  test("the network always decides the chain", () => {
    const client = createRegistryClient("testnet", { chainId: 1 } as any) as any
    expect(client.chainId).toBe(11155111)
  })

  test("rejects an unknown network", () => {
    expect(() => createRegistryClient("devnet" as any)).toThrow("Unknown registry network: devnet")
  })
})
