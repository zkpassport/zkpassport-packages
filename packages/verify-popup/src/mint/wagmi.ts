import { getCredentialsChain } from "@zkpassport/onchain-credentials"
import { getChainRpcUrl } from "@zkpassport/registry"
import { getIdFromChain, type SupportedChain } from "@zkpassport/utils"
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

/**
 * Production RPC for a chain: `VITE_RPC_URL_<CHAIN>` if set, else the endpoint the registry already
 * uses. Falling through to viem's public default would mean a rate-limited node the rest of the app
 * never touches.
 */
export function configuredRpcUrl(
  chain: SupportedChain,
  env: Record<string, unknown> = import.meta.env,
): string | undefined {
  const url = env[`VITE_RPC_URL_${chain.toUpperCase()}`]
  if (typeof url === "string" && url.length > 0) return url
  return getChainRpcUrl(getIdFromChain(chain))
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
 * Wagmi config for the chain the credential policy lives on. Built per configure
 * message: the chain (and its RPC override) is only known at runtime.
 *
 * `injected` covers browser extensions — wagmi lists each one announced via
 * EIP-6963 separately, plus a plain connector for wallets that only set
 * window.ethereum. WalletConnect covers everything that is not an extension:
 * mobile wallets, desktop apps and hardware bridges all reach us through it.
 * It is skipped when no project id is configured, so local dev still runs.
 */
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
