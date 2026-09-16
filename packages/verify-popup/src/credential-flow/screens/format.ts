import type { Address, Chain, Hex } from "viem"

export function shortHex(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function explorerUrl(chain: Chain, path: string): string | null {
  const base = chain.blockExplorers?.default.url
  return base ? `${base.replace(/\/$/, "")}/${path}` : null
}

export function explorerTxUrl(chain: Chain, hash: Hex): string | null {
  return explorerUrl(chain, `tx/${hash}`)
}

export function explorerAddressUrl(chain: Chain, address: Address): string | null {
  return explorerUrl(chain, `address/${address}`)
}
