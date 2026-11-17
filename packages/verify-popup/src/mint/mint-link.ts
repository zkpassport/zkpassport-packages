import { getIdFromChain, type SupportedChain } from "@zkpassport/utils"

export type MintLink = { chain: SupportedChain; policyId: `0x${string}` }

/**
 * Read a hosted mint link's `chain` (a chain name such as `base`) and `policy` (the credential
 * policy id, 0x and 64 hex digits) query parameters.
 */
export function parseMintLink(search: string): MintLink | { error: string } {
  const params = new URLSearchParams(search)
  const chain = params.get("chain") ?? ""
  const policyId = params.get("policy") ?? ""

  if (!isSupportedChain(chain)) {
    return { error: "This mint link names a network ZKPassport does not support." }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(policyId)) {
    return { error: "This mint link has no valid credential ID." }
  }
  return { chain, policyId: `0x${policyId.slice(2).toLowerCase()}` }
}

function isSupportedChain(value: string): value is SupportedChain {
  try {
    getIdFromChain(value as SupportedChain)
    return true
  } catch {
    return false
  }
}
