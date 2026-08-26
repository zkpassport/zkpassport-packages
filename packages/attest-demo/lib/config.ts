export class DemoConfigError extends Error {}

export type DemoConfig = {
  chain: "ethereum_sepolia"
  registry: `0x${string}`
  popupUrl: string
}

export function parseDemoConfig(raw: {
  chain?: string
  registry?: string
  popupUrl?: string
}): DemoConfig {
  const chain = raw.chain ?? "ethereum_sepolia"
  if (chain !== "ethereum_sepolia") {
    throw new DemoConfigError(
      `NEXT_PUBLIC_CHAIN must be ethereum_sepolia (got "${chain}"); the demo is testnet-only.`,
    )
  }
  if (!raw.registry || !/^0x[0-9a-fA-F]{40}$/.test(raw.registry)) {
    throw new DemoConfigError(
      `NEXT_PUBLIC_REGISTRY_ADDRESS must be a 0x-prefixed address (got "${raw.registry ?? ""}").`,
    )
  }
  const popupUrl = (raw.popupUrl ?? "http://localhost:3000").replace(/\/$/, "")
  return { chain, registry: raw.registry as `0x${string}`, popupUrl }
}

export function loadConfig(): DemoConfig {
  return parseDemoConfig({
    chain: process.env.NEXT_PUBLIC_CHAIN,
    registry: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
    popupUrl: process.env.NEXT_PUBLIC_POPUP_URL,
  })
}
