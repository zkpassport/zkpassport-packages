import { describe, expect, test } from "bun:test"
import { PopupConfigError, parsePopupParams } from "../lib/params"

const REGISTRY = "0x1111111111111111111111111111111111111111"
const VALID = `chain=ethereum_sepolia&registry=${REGISTRY}&policyId=42`
const sp = (query: string) => new URLSearchParams(query)
const parse = (query: string, allowRpcOverride = false) =>
  parsePopupParams(sp(query), { allowRpcOverride })

describe("parsePopupParams", () => {
  test("parses a valid config", () => {
    expect(parse(VALID)).toEqual({
      chain: "ethereum_sepolia",
      registry: REGISTRY,
      policyId: 42n,
      devMode: false,
      rpcOverride: undefined,
    })
  })

  test("parses hex policy ids", () => {
    expect(parse(`chain=local&registry=${REGISTRY}&policyId=0x2a`).policyId).toBe(42n)
  })

  test("dev=1 enables devMode", () => {
    expect(parse(`${VALID}&dev=1`).devMode).toBe(true)
  })

  test("rejects a missing chain", () => {
    expect(() => parse(`registry=${REGISTRY}&policyId=1`)).toThrow(PopupConfigError)
  })

  test("rejects an unmapped chain with the supported list", () => {
    expect(() => parse(`chain=base&registry=${REGISTRY}&policyId=1`)).toThrow(/ethereum_sepolia/)
  })

  test("rejects a malformed registry address", () => {
    expect(() => parse(`chain=local&registry=0x123&policyId=1`)).toThrow(/registry/)
  })

  test("rejects a malformed policy id", () => {
    expect(() => parse(`chain=local&registry=${REGISTRY}&policyId=abc`)).toThrow(/policyId/)
  })

  test("keeps rpc when devMode is on", () => {
    expect(parse(`${VALID}&dev=1&rpc=http://localhost:8545`).rpcOverride).toBe(
      "http://localhost:8545",
    )
  })

  test("keeps rpc when the build allows overrides", () => {
    expect(parse(`${VALID}&rpc=http://localhost:8545`, true).rpcOverride).toBe(
      "http://localhost:8545",
    )
  })

  test("ignores rpc in production non-dev requests", () => {
    expect(parse(`${VALID}&rpc=http://localhost:8545`).rpcOverride).toBeUndefined()
  })
})
