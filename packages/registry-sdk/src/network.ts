import { RegistryClient } from "./client"
import type { RegistryNetwork, RegistryNetworkOptions } from "./types"

/**
 * The chain each registry network lives on. This is the one place a network label becomes a
 * chain ID, so callers pick a network by meaning and never hard-code 1 / 11155111 / 31337.
 */
export const REGISTRY_NETWORK_CHAIN_IDS: Record<RegistryNetwork, number> = {
  mainnet: 1,
  testnet: 11155111,
  dev: 31337,
}

/**
 * Create a RegistryClient for a network. Overrides replace that network's defaults, e.g. a local
 * anvil RPC, its contract addresses and a local file server for the "dev" network.
 */
export function createRegistryClient(
  network: RegistryNetwork,
  overrides: RegistryNetworkOptions = {},
): RegistryClient {
  const chainId = REGISTRY_NETWORK_CHAIN_IDS[network]
  if (chainId === undefined) throw new Error(`Unknown registry network: ${network}`)
  return new RegistryClient({ ...overrides, chainId })
}
