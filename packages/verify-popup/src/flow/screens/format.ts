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

// Wagmi names the plain injected connector "Injected", which says nothing to
// someone who only knows the wallet by the extension in their browser.
export function walletLabel(connector: { id: string; name: string } | undefined): string {
  if (!connector) return "Connected wallet"
  return connector.id === "injected" ? "Browser wallet" : connector.name
}
