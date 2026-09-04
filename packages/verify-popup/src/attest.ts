import { AttestClient } from "@zkpassport/sdk"
import type { PopupAttestConfig, PopupAttestIssueCall } from "@zkpassport/sdk/popup"
import { createPublicClient, http, type Chain, type PublicClient } from "viem"
import { ensureWalletChain, type ConnectedWallet } from "./wallet"

export type AttestContext = {
  chain: Chain
  publicClient: PublicClient
  attest: AttestClient
}

export function createAttestContext(config: PopupAttestConfig, chain: Chain): AttestContext {
  const publicClient = createPublicClient({ chain, transport: http() })
  return {
    chain,
    publicClient,
    attest: new AttestClient({ client: publicClient, address: config.registry }),
  }
}

export async function hasCredential(
  ctx: AttestContext,
  wallet: `0x${string}`,
  policyId: bigint,
): Promise<boolean> {
  return (await ctx.attest.balanceOf(wallet, policyId)) > 0n
}

/**
 * The single submission path for ZKPassportAttest.issue(). Any connected
 * account works as the sender — the credential goes to the wallet bound into
 * the proof. A relayer or sponsored-gas flow replaces this function's
 * internals; nothing upstream changes.
 */
export async function mintCredential(
  ctx: AttestContext,
  call: PopupAttestIssueCall,
  wallet: ConnectedWallet,
  onSubmitted?: (hash: `0x${string}`) => void,
): Promise<`0x${string}`> {
  await ensureWalletChain(wallet, ctx.chain)
  const hash = await wallet.client.writeContract({
    address: call.address,
    abi: call.abi as never,
    functionName: call.functionName,
    args: call.args as never,
    account: wallet.account,
    chain: ctx.chain,
  })
  onSubmitted?.(hash)
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === "reverted") {
    throw new Error(`Credential mint reverted (tx ${hash}).`)
  }
  return hash
}
