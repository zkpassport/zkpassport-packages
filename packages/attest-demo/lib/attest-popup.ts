import { openVerificationPopup, type PopupCallbacks } from "@zkpassport/sdk/popup"
import type { DemoConfig } from "./config"

export function policyIdHex(policyId: bigint): `0x${string}` {
  return `0x${policyId.toString(16).padStart(64, "0")}` as `0x${string}`
}

/**
 * Open the hosted verify popup in attest mode for this demo's registry.
 * devMode makes the mobile app root the proof in the testnet registries; the
 * demo is testnet-only, and sepolia contracts reject mainnet-rooted proofs.
 */
export function openAttestPopup(
  config: DemoConfig,
  policyId: bigint,
  walletAddress: `0x${string}`,
  callbacks?: PopupCallbacks,
): Window | null {
  const handle = openVerificationPopup({
    popupUrl: config.popupUrl,
    request: {
      name: "Attest Demo",
      devMode: true,
      attest: {
        chain: config.chain,
        policyId: policyIdHex(policyId),
        walletAddress,
        registry: config.registry,
        rpcUrl: config.rpcUrl,
      },
    },
    query: {},
    callbacks,
  })
  return handle?.popup ?? null
}
