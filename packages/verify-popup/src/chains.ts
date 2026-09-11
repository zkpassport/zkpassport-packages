import { getAttestChain } from "@zkpassport/sdk"
import type { SupportedChain } from "@zkpassport/utils"
import type { Chain } from "viem"

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
  const base = getAttestChain(chain)
  if (!rpcOverride) return base
  return {
    ...base,
    rpcUrls: { ...base.rpcUrls, default: { ...base.rpcUrls.default, http: [rpcOverride] } },
  }
}
