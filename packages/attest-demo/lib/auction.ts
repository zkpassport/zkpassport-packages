import { PolicyValidationHookAbi } from "@zkpassport/sdk"
import type { Abi, PublicClient } from "viem"
import { MockAuctionAbi, MockAuctionBytecode } from "./assets/mock-auction"
import type { WriteRequest } from "./wallet"

export function mockAuctionArtifact(): { abi: Abi; bytecode: `0x${string}` } {
  return { abi: MockAuctionAbi as unknown as Abi, bytecode: MockAuctionBytecode }
}

/**
 * Resolve an auction's gate: auction.validationHook() -> hook.erc1155()/tokenId(),
 * checked against this demo's registry. Null (never throws) when the auction or
 * hook does not match — an EOA, another registry's hook, or reverting reads.
 */
export async function introspectAuction(
  publicClient: PublicClient,
  registry: `0x${string}`,
  auction: `0x${string}`,
): Promise<{ hook: `0x${string}`; policyId: bigint } | null> {
  try {
    const hook = (await publicClient.readContract({
      address: auction,
      abi: MockAuctionAbi as unknown as Abi,
      functionName: "validationHook",
    } as never)) as `0x${string}`
    const readHook = (functionName: string) =>
      publicClient.readContract({
        address: hook,
        abi: PolicyValidationHookAbi,
        functionName,
      } as never)
    const [erc1155, tokenId] = await Promise.all([readHook("erc1155"), readHook("tokenId")])
    if ((erc1155 as string).toLowerCase() !== registry.toLowerCase()) return null
    return { hook, policyId: tokenId as bigint }
  } catch {
    return null
  }
}

export function submitBidRequest(
  auction: `0x${string}`,
  form: { maxPrice: bigint; amount: bigint; owner: `0x${string}` },
): WriteRequest {
  return {
    address: auction,
    abi: MockAuctionAbi as unknown as Abi,
    functionName: "submitBid",
    args: [form.maxPrice, form.amount, form.owner, "0x"],
  }
}
