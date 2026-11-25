import { getCredentialsChain } from "@zkpassport/onchain-credentials"
import { getNetworkConstants } from "@zkpassport/registry"
import { getIdFromChain, type SupportedChain } from "@zkpassport/utils"
import type { Chain } from "viem"

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"])

export function rpcOverrideFromLocation(location: {
  hostname: string
  search: string
}): string | undefined {
  if (!LOCAL_HOSTS.has(location.hostname)) return undefined
  return new URLSearchParams(location.search).get("rpc") ?? undefined
}

export function configuredRpcUrl(
  chain: SupportedChain,
  env: Record<string, unknown> = import.meta.env,
): string | undefined {
  const url = env[`VITE_RPC_URL_${chain.toUpperCase()}`]
  if (typeof url === "string" && url.length > 0) return url
  return getNetworkConstants(getIdFromChain(chain)).rpcUrl
}

export function resolveCredentialsChain(chain: SupportedChain, rpcUrl?: string): Chain {
  const base = getCredentialsChain(chain)
  if (!rpcUrl) return base
  return {
    ...base,
    rpcUrls: { ...base.rpcUrls, default: { ...base.rpcUrls.default, http: [rpcUrl] } },
  }
}

import { createConfig, http, injected, type Config } from "wagmi"
import { walletConnect } from "wagmi/connectors"

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

/**
 * The credentials chain at the RPC this page uses, with a wallet config for it, or why the chain
 * can't be used.
 */
export function resolveWalletChain(
  chain: SupportedChain,
): { chain: Chain; config: Config } | { error: string } {
  try {
    const resolved = resolveCredentialsChain(
      chain,
      rpcOverrideFromLocation(window.location) ?? configuredRpcUrl(chain),
    )
    return { chain: resolved, config: buildWalletConfig(resolved) }
  } catch (reason) {
    return { error: reason instanceof Error ? reason.message : String(reason) }
  }
}

export function buildWalletConfig(chain: Chain): Config {
  const connectors = [injected()]
  if (WALLETCONNECT_PROJECT_ID) {
    connectors.push(
      walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: true }) as never,
    )
  }
  return createConfig({
    chains: [chain],
    connectors,
    transports: { [chain.id]: http(chain.rpcUrls.default.http[0]) },
  })
}
