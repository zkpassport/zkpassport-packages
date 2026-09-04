import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets"
import { http, type Chain, type WalletClient } from "viem"
import type { Config } from "wagmi"

export type ConnectedWallet = {
  account: `0x${string}`
  client: WalletClient
}

export type WalletSelection = {
  projectId: string
  /** True when no WalletConnect project id is configured (browser wallets only). */
  injectedOnly: boolean
}

export function walletConnectProjectId(
  env: Record<string, unknown> = import.meta.env,
): string | undefined {
  const id = env.VITE_WALLETCONNECT_PROJECT_ID
  return typeof id === "string" && id.length > 0 ? id : undefined
}

/**
 * Without a WalletConnect project id only the injected wallet is offered, so
 * the placeholder id never reaches the relay — injected connections don't
 * use it, and RainbowKit merely requires the field to be present.
 */
export function selectWallets(projectId: string | undefined): WalletSelection {
  if (!projectId) return { projectId: "walletconnect-not-configured", injectedOnly: true }
  return { projectId, injectedOnly: false }
}

export type WalletSetup = WalletSelection & { config: Config }

/**
 * Wagmi config for the chain the attest policy lives on. Built per configure
 * message: the chain (and its RPC override) is only known at runtime.
 */
export function buildWalletSetup(
  chain: Chain,
  projectId: string | undefined = walletConnectProjectId(),
): WalletSetup {
  const selection = selectWallets(projectId)
  const config = getDefaultConfig({
    appName: "ZKPassport",
    projectId: selection.projectId,
    chains: [chain],
    transports: { [chain.id]: http(chain.rpcUrls.default.http[0]) },
    ...(selection.injectedOnly
      ? { wallets: [{ groupName: "Wallets", wallets: [injectedWallet] }] }
      : {}),
  })
  return { ...selection, config }
}

export async function ensureWalletChain(wallet: ConnectedWallet, chain: Chain): Promise<void> {
  try {
    await wallet.client.switchChain({ id: chain.id })
  } catch {
    await wallet.client.addChain({ chain })
    await wallet.client.switchChain({ id: chain.id })
  }
}
