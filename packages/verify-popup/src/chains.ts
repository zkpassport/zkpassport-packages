import type { SupportedChain } from "@zkpassport/utils"
import type { Chain } from "viem"
import { anvil, sepolia } from "viem/chains"

// Chains the attest flow can mint on; extend as registries are deployed
const ATTEST_CHAINS: Partial<Record<SupportedChain, Chain>> = {
  ethereum_sepolia: sepolia,
  local: anvil,
}

/**
 * Dev RPC override from the popup's own URL (`?rpc=http://localhost:8545`),
 * e.g. to read a Sepolia fork that carries the canonical registry state. This
 * is deliberately not part of the page-facing options or the popup protocol —
 * dev knobs travel on popupUrl.
 */
export function rpcOverrideFromLocation(search: string): string | undefined {
  return new URLSearchParams(search).get("rpc") ?? undefined
}

export function resolveAttestChain(chain: SupportedChain, rpcOverride?: string): Chain {
  const base = ATTEST_CHAINS[chain]
  if (!base) {
    throw new Error(`Attestation minting is not supported on '${chain}' yet.`)
  }
  if (!rpcOverride) return base
  return {
    ...base,
    rpcUrls: { ...base.rpcUrls, default: { ...base.rpcUrls.default, http: [rpcOverride] } },
  }
}
