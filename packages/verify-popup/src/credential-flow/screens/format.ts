import type { Chain, Hex } from "viem"

export function shortHex(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function explorerTxUrl(chain: Chain, hash: Hex): string | null {
  const base = chain.blockExplorers?.default.url
  return base ? `${base.replace(/\/$/, "")}/tx/${hash}` : null
}
