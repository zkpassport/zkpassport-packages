import { createWalletClient, custom, type Chain, type WalletClient } from "viem"

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>
}

export type ConnectedWallet = {
  account: `0x${string}`
  client: WalletClient
}

export function getInjectedProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined
  return (window as { ethereum?: Eip1193Provider }).ethereum
}

/**
 * Connect a signer to pay for the mint transaction. Any account works:
 * issue() sends the credential to the wallet bound into the proof, not to
 * the transaction sender.
 */
export async function connectWallet(
  chain: Chain,
  provider: Eip1193Provider | undefined = getInjectedProvider(),
): Promise<ConnectedWallet> {
  if (!provider) {
    throw new Error("No browser wallet found to submit the mint transaction.")
  }
  const client = createWalletClient({ chain, transport: custom(provider) })
  const [account] = await client.requestAddresses()
  if (!account) {
    throw new Error("The wallet returned no accounts.")
  }
  return { account, client }
}

export async function ensureWalletChain(wallet: ConnectedWallet, chain: Chain): Promise<void> {
  try {
    await wallet.client.switchChain({ id: chain.id })
  } catch {
    await wallet.client.addChain({ chain })
    await wallet.client.switchChain({ id: chain.id })
  }
}
