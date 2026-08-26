import { describe, expect, test } from "bun:test"
import { parseDemoConfig } from "../lib/config"
import { buildPopupUrl } from "../lib/popup-url"

const REGISTRY = "0x1111111111111111111111111111111111111111"

describe("buildPopupUrl", () => {
  test("builds the popup link for a policy", () => {
    const config = parseDemoConfig({ registry: REGISTRY, popupUrl: "http://localhost:3000" })
    expect(buildPopupUrl(config, 42n)).toBe(
      `http://localhost:3000/?chain=ethereum_sepolia&registry=${REGISTRY}&policyId=42`,
    )
  })
})
