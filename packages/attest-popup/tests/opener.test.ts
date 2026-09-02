import { describe, expect, test } from "bun:test"

import { buildOpenerResult } from "../lib/opener"
import { parsePopupParams } from "../lib/params"

const REGISTRY = "0x0FF14Da5e8A6AE442772Fc810BA815A73240d566"

describe("buildOpenerResult", () => {
  test("serializes the popup config into a postMessage payload", () => {
    const config = parsePopupParams(
      new URLSearchParams(`chain=ethereum_sepolia&registry=${REGISTRY}&policyId=42&dev=1`),
      { allowRpcOverride: false },
    )
    expect(buildOpenerResult(config, "issued")).toEqual({
      type: "zkpassport-attest-result",
      status: "issued",
      chain: "ethereum_sepolia",
      registry: REGISTRY,
      policyId: "42",
    })
  })

  test("stringifies hash-like policy ids without precision loss", () => {
    const policyId = 2n ** 200n + 7n
    const config = parsePopupParams(
      new URLSearchParams(`chain=ethereum_sepolia&registry=${REGISTRY}&policyId=${policyId}&dev=1`),
      { allowRpcOverride: false },
    )
    expect(buildOpenerResult(config, "already-verified").policyId).toBe(policyId.toString())
  })
})
