import { getCredentialsChain } from "@zkpassport/onchain-credentials"
import type { SupportedChain } from "@zkpassport/utils"
import type { Chain } from "viem"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"])

/**
 * Dev RPC override from the popup's own URL (`?rpc=http://localhost:8545`), e.g. to
 * read a Sepolia fork that carries the canonical registry state. Honoured only when
 * the popup itself runs on localhost; dev knobs travel on popupUrl, not the protocol.
 */
export function rpcOverrideFromLocation(location: {
  hostname: string
  search: string
}): string | undefined {
  if (!LOCAL_HOSTS.has(location.hostname)) return undefined
  return new URLSearchParams(location.search).get("rpc") ?? undefined
}

/** Production RPC for a chain from `VITE_RPC_URL_<CHAIN>`; unset means viem's public default. */
export function configuredRpcUrl(
  chain: SupportedChain,
  env: Record<string, unknown> = import.meta.env,
): string | undefined {
  const url = env[`VITE_RPC_URL_${chain.toUpperCase()}`]
  return typeof url === "string" && url.length > 0 ? url : undefined
}

export function resolveCredentialsChain(chain: SupportedChain, rpcUrl?: string): Chain {
  const base = getCredentialsChain(chain)
  if (!rpcUrl) return base
  return {
    ...base,
    rpcUrls: { ...base.rpcUrls, default: { ...base.rpcUrls.default, http: [rpcUrl] } },
  }
}
