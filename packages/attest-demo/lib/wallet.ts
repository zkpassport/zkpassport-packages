import {
  createWalletClient,
  custom,
  type Abi,
  type Chain,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem"

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

export type WriteRequest = {
  address: `0x${string}`
  abi: Abi
  functionName: string
  args: readonly unknown[]
}

export async function writeAndWait(
  wallet: ConnectedWallet,
  publicClient: PublicClient,
  chain: Chain,
  request: WriteRequest,
): Promise<TransactionReceipt> {
  const hash = await wallet.client.writeContract({
    address: request.address,
    abi: request.abi,
    functionName: request.functionName,
    args: request.args as never,
    account: wallet.account,
    chain,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === "reverted") {
    throw new Error(`Transaction reverted (tx ${receipt.transactionHash}).`)
  }
  return receipt
}

export async function deployAndWait(
  wallet: ConnectedWallet,
  publicClient: PublicClient,
  chain: Chain,
  artifact: { abi: Abi; bytecode: `0x${string}` },
  args: readonly unknown[],
): Promise<{ address: `0x${string}`; receipt: TransactionReceipt }> {
  const hash = await wallet.client.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: args as never,
    account: wallet.account,
    chain,
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === "reverted" || !receipt.contractAddress) {
    throw new Error(`Deployment failed — no contract address (tx ${receipt.transactionHash}).`)
  }
  return { address: receipt.contractAddress, receipt }
}
