import { AttestClient } from "@zkpassport/sdk"
import type { AttestPolicy } from "@zkpassport/sdk"
import type { AttestIssueCall } from "@zkpassport/ui"
import {
  createPublicClient,
  http,
  type Chain,
  type PublicClient,
  type TransactionReceipt,
} from "viem"
import type { PopupConfig } from "./params"
import type { ConnectedWallet } from "./wallet"

export type AttestContext = {
  publicClient: PublicClient
  attest: AttestClient
}

export type PolicyView = {
  policy: AttestPolicy
  domain: string
}

export function createAttestContext(config: PopupConfig, chain: Chain): AttestContext {
  const publicClient = createPublicClient({ chain, transport: http() })
  return {
    publicClient,
    attest: new AttestClient({ client: publicClient, address: config.registry }),
  }
}

export async function fetchPolicyView(ctx: AttestContext, policyId: bigint): Promise<PolicyView> {
  const [policy, domain] = await Promise.all([
    ctx.attest.getPolicy(policyId),
    ctx.publicClient.readContract({
      address: ctx.attest.address,
      abi: ctx.attest.getIssueDetails().abi,
      functionName: "domain",
    } as never) as Promise<string>,
  ])
  return { policy, domain }
}

export async function checkCredential(
  ctx: AttestContext,
  wallet: `0x${string}`,
  policyId: bigint,
): Promise<boolean> {
  return (await ctx.attest.balanceOf(wallet, policyId)) > 0n
}

/**
 * The single submission path for ZKPassportAttest.issue(). A relayer or
 * sponsored-gas flow replaces this function's internals; nothing upstream
 * changes.
 */
export async function submitIssue(
  ctx: AttestContext,
  wallet: ConnectedWallet,
  chain: Chain,
  call: AttestIssueCall,
  onSubmitted?: (hash: `0x${string}`) => void,
): Promise<TransactionReceipt> {
  const hash = await wallet.client.writeContract({
    address: call.address,
    abi: call.abi,
    functionName: call.functionName,
    args: call.args as never,
    account: wallet.account,
    chain,
  })
  onSubmitted?.(hash)
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === "reverted") {
    throw new Error(`Credential mint reverted (tx ${receipt.transactionHash}).`)
  }
  return receipt
}
