export class DemoConfigError extends Error {}

// Same public endpoint the SDK ships with; viem's default sepolia RPC caps
// eth_getLogs to a 10k-block range, which breaks the from-genesis policy scan.
const DEFAULT_RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G"

export type DemoConfig = {
  chain: "ethereum_sepolia"
  registry: `0x${string}`
  popupUrl: string
  rpcUrl: string
  deployBlock: bigint
}

export function parseDemoConfig(raw: {
  chain?: string
  registry?: string
  popupUrl?: string
  rpcUrl?: string
  deployBlock?: string
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
  const popupUrl = (raw.popupUrl ?? "http://localhost:5173").replace(/\/$/, "")
  const rpcUrl = raw.rpcUrl || DEFAULT_RPC_URL
  if (raw.deployBlock && !/^\d+$/.test(raw.deployBlock)) {
    throw new DemoConfigError(
      `NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK must be a decimal block number (got "${raw.deployBlock}").`,
    )
  }
  const deployBlock = raw.deployBlock ? BigInt(raw.deployBlock) : 0n
  return { chain, registry: raw.registry as `0x${string}`, popupUrl, rpcUrl, deployBlock }
}

export function loadConfig(): DemoConfig {
  return parseDemoConfig({
    chain: process.env.NEXT_PUBLIC_CHAIN,
    registry: process.env.NEXT_PUBLIC_REGISTRY_ADDRESS,
    popupUrl: process.env.NEXT_PUBLIC_POPUP_URL,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
    deployBlock: process.env.NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK,
  })
}
