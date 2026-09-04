import { isPopupChain, SUPPORTED_POPUP_CHAINS, type PopupChain } from "./chains"

export class PopupConfigError extends Error {}

export type PopupConfig = {
  chain: PopupChain
  registry: `0x${string}`
  policyId: bigint
  devMode: boolean
  rpcOverride?: string
}

export function parsePopupParams(
  search: URLSearchParams,
  options: { allowRpcOverride: boolean },
): PopupConfig {
  const chain = search.get("chain")
  if (!chain || !isPopupChain(chain)) {
    throw new PopupConfigError(
      `Unsupported chain "${chain ?? ""}". Expected one of: ${SUPPORTED_POPUP_CHAINS.join(", ")}.`,
    )
  }

  const registry = search.get("registry")
  if (!registry || !/^0x[0-9a-fA-F]{40}$/.test(registry)) {
    throw new PopupConfigError(`Invalid registry address "${registry ?? ""}".`)
  }

  const rawPolicyId = search.get("policyId")
  if (!rawPolicyId || !/^(\d+|0x[0-9a-fA-F]+)$/.test(rawPolicyId)) {
    throw new PopupConfigError(`Invalid policyId "${rawPolicyId ?? ""}".`)
  }

  const devMode = search.get("dev") === "1"
  const rpc = search.get("rpc")
  const rpcOverride = rpc && (devMode || options.allowRpcOverride) ? rpc : undefined

  return {
    chain,
    registry: registry as `0x${string}`,
    policyId: BigInt(rawPolicyId),
    devMode,
    rpcOverride,
  }
}
