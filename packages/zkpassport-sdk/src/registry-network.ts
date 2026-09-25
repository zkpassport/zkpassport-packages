import type { RegistryNetwork } from "@zkpassport/registry"

/**
 * The registry network to read when none is configured. Dev mode keeps reading testnet (Sepolia),
 * as it always has, so existing integrators see no change.
 */
export function defaultRegistryNetwork(devMode?: boolean): RegistryNetwork {
  return devMode ? "testnet" : "mainnet"
}
