import type { SupportedChain } from "@zkpassport/utils"
import type { Chain } from "viem"
import { anvil, sepolia } from "viem/chains"

// Chains the attest flow can mint on; extend as registries are deployed
const ATTEST_CHAINS: Partial<Record<SupportedChain, Chain>> = {
  ethereum_sepolia: sepolia,
  local: anvil,
}

export function resolveAttestChain(chain: SupportedChain, rpcOverride?: string): Chain {
  const base = ATTEST_CHAINS[chain]
  if (!base) {
    throw new Error(`Attestation minting is not supported on '${chain}' yet.`)
  }
  if (!rpcOverride) return base
  return { ...base, rpcUrls: { default: { http: [rpcOverride] } } }
}
