import { createWalletClient, custom, type Chain, type WalletClient } from "viem"

export type Eip1193Provider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

export type ConnectedWallet = {
  account: `0x${string}`
  client: WalletClient
}

export function getInjectedProvider(): Eip1193Provider | undefined {
  if (typeof window === "undefined") return undefined
  return (window as { ethereum?: Eip1193Provider }).ethereum
}

export async function connectWallet(
  chain: Chain,
  provider: Eip1193Provider | undefined = getInjectedProvider(),
): Promise<ConnectedWallet> {
  if (!provider) {
    throw new Error("No browser wallet found. Install MetaMask (or another wallet) to continue.")
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

export function onAccountsChanged(
  handler: (accounts: string[]) => void,
  provider: Eip1193Provider | undefined = getInjectedProvider(),
): () => void {
  if (!provider?.on) return () => {}
  const listener = (accounts: unknown) => handler(accounts as string[])
  provider.on("accountsChanged", listener)
  return () => provider.removeListener?.("accountsChanged", listener)
}
