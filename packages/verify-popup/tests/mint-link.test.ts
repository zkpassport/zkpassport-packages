import { describe, expect, test } from "bun:test"
import { parseMintLink } from "../src/mint/mint-link"

const POLICY_ID = `0x${"ab".repeat(32)}` as const

describe("parseMintLink", () => {
  test("reads the chain and a lowercased credential id", () => {
    expect(parseMintLink(`?chain=base&policy=0x${"AB".repeat(32)}`)).toEqual({
      chain: "base",
      policyId: POLICY_ID,
    })
  })

  test("rejects a missing chain or one ZKPassport does not know", () => {
    const error = { error: "Credential minting is not supported in this network." }
    expect(parseMintLink(`?chain=solana&policy=${POLICY_ID}`)).toEqual(error)
    expect(parseMintLink(`?policy=${POLICY_ID}`)).toEqual(error)
  })

  test("rejects a missing or malformed credential id", () => {
    const error = { error: "This mint link has no valid credential ID." }
    expect(parseMintLink("?chain=base")).toEqual(error)
    expect(parseMintLink("?chain=base&policy=0x1234")).toEqual(error)
    expect(parseMintLink(`?chain=base&policy=${POLICY_ID}00`)).toEqual(error)
  })
})
