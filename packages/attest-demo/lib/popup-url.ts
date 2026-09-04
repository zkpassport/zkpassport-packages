import type { DemoConfig } from "./config"

export function buildPopupUrl(config: DemoConfig, policyId: bigint): string {
  // dev=1 makes the mobile app root the proof in the testnet registries; the
  // demo is testnet-only, and sepolia contracts reject mainnet-rooted proofs.
  return `${config.popupUrl}/?chain=${config.chain}&registry=${config.registry}&policyId=${policyId}&dev=1`
}
