/**
 * A policy reference is either a dashboard id or a chain-scoped one:
 *
 *   "kyc-v1"              dashboard
 *   "eip155:8453:0x7b"    on-chain, Base
 *   "0x7b"                on-chain, chain left to the caller
 *
 * The format decides which registry it belongs to, so dashboard ids must never be able to look like
 * the on-chain forms — that is enforced where policies are created, not here.
 */
export type ParsedPolicyId =
  | { kind: "dashboard"; id: string }
  /** `chainId` is absent when the id named no chain; the caller decides what that resolves to. */
  | { kind: "onchain"; chainId?: number; policyId: `0x${string}` }

const ONCHAIN_ID = /^0x[0-9a-fA-F]{1,64}$/
const CAIP = /^eip155:(\d+):(0x[0-9a-fA-F]{1,64})$/

/** The chain a bare `0x…` id resolves to when nothing else names one. */
export const DEFAULT_POLICY_CHAIN_ID = 1

export function parsePolicyId(id: string): ParsedPolicyId {
  const caip = CAIP.exec(id)
  if (caip) {
    return {
      kind: "onchain",
      chainId: Number(caip[1]),
      policyId: caip[2] as `0x${string}`,
    }
  }
  if (ONCHAIN_ID.test(id)) {
    return {
      kind: "onchain",
      policyId: id as `0x${string}`,
    }
  }
  if (id.startsWith("eip155:")) {
    throw new Error(
      `Malformed on-chain policy id "${id}". Expected eip155:<chainId>:0x<id>, for example ` +
        `eip155:8453:0x7b.`,
    )
  }
  return { kind: "dashboard", id }
}
