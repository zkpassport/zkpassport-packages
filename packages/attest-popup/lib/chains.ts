import type { Chain } from "viem"
import { anvil, sepolia } from "viem/chains"

const POPUP_CHAINS = {
  ethereum_sepolia: sepolia,
  local: anvil,
} as const satisfies Record<string, Chain>

export type PopupChain = keyof typeof POPUP_CHAINS

export const SUPPORTED_POPUP_CHAINS = Object.keys(POPUP_CHAINS) as PopupChain[]

export function isPopupChain(value: string): value is PopupChain {
  return value in POPUP_CHAINS
}

export function resolveChain(chain: PopupChain, rpcOverride?: string): Chain {
  const base = POPUP_CHAINS[chain]
  if (!rpcOverride) return base
  return { ...base, rpcUrls: { default: { http: [rpcOverride] } } }
}
