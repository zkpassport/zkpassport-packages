import type { DemoConfig } from "./config"

export function buildPopupUrl(config: DemoConfig, policyId: bigint): string {
  return `${config.popupUrl}/?chain=${config.chain}&registry=${config.registry}&policyId=${policyId}`
}
