import { createConfig, http, injected, type Config } from "wagmi"
import type { Chain } from "viem"

/**
 * Wagmi config for the chain the credential policy lives on. Built per configure
 * message: the chain (and its RPC override) is only known at runtime.
 *
 * Browser wallets only: wagmi lists every extension announced via EIP-6963 as its
 * own connector, and the plain injected connector covers wallets that only set
 * window.ethereum. WalletConnect would need a project id plus the
 * `@walletconnect/ethereum-provider` peer; add `walletConnect({ projectId })` here
 * if it is ever wanted.
 */
export function buildWalletConfig(chain: Chain): Config {
  return createConfig({
    chains: [chain],
    connectors: [injected()],
    transports: { [chain.id]: http(chain.rpcUrls.default.http[0]) },
  })
}
