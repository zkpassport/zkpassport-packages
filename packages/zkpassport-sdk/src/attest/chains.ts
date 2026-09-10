import type { Chain } from "viem"
import { anvil, sepolia } from "viem/chains"
import type { SupportedChain } from "@zkpassport/utils"

/**
 * Viem chain configs for the chains attest runs on; extend alongside
 * registries.ts as deployments land. `local` carries no registry entry — dev
 * setups add one in registries.ts for their deployment.
 */
const ATTEST_CHAINS: Partial<Record<SupportedChain, Chain>> = {
  ethereum_sepolia: sepolia,
  local: anvil,
}

export function getAttestChain(chain: SupportedChain): Chain {
  const config = ATTEST_CHAINS[chain]
  if (!config) {
    throw new Error(`Attestation minting is not supported on '${chain}' yet.`)
  }
  return config
}
