import type { PopupConfig } from "./params"

/**
 * Message posted to the window that opened the popup when verification reaches
 * a terminal success state, so the opener can refresh eligibility immediately
 * instead of polling. policyId travels as a decimal string: bigint does not
 * survive structured clone across origins in every browser.
 */
export type AttestPopupResult = {
  type: "zkpassport-attest-result"
  status: "issued" | "already-verified" | "dev-verified"
  chain: string
  registry: `0x${string}`
  policyId: string
}

export function buildOpenerResult(
  config: PopupConfig,
  status: AttestPopupResult["status"],
): AttestPopupResult {
  return {
    type: "zkpassport-attest-result",
    status,
    chain: config.chain,
    registry: config.registry,
    policyId: config.policyId.toString(),
  }
}

/** Posts the result to the opener, if any. The payload is public on-chain data. */
export function notifyOpener(config: PopupConfig, status: AttestPopupResult["status"]): void {
  const opener = window.opener as Window | null
  opener?.postMessage(buildOpenerResult(config, status), "*")
}
