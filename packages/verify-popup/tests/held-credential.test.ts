import { describe, expect, test } from "bun:test"
import { heldCredentialUntil } from "../src/mint/held-credential"

const RECIPIENT = `0x${"12".repeat(20)}` as const
const POLICY_ID = 7n
const HELD_UNTIL = 1_900_000_000n

function contract(holds: boolean) {
  return {
    hasCredential: async () => holds,
    heldUntil: async () => (holds ? HELD_UNTIL : 0n),
  }
}

describe("heldCredentialUntil", () => {
  test("gives a holder's expiry, so the flow ends without proving", async () => {
    expect(await heldCredentialUntil(contract(true), RECIPIENT, POLICY_ID)).toBe(HELD_UNTIL)
  })

  test("is null for a wallet without the credential, so the flow proves and mints", async () => {
    expect(await heldCredentialUntil(contract(false), RECIPIENT, POLICY_ID)).toBeNull()
  })

  test("is null for a holder renewing the credential, so the flow proves and mints again", async () => {
    expect(await heldCredentialUntil(contract(true), RECIPIENT, POLICY_ID, true)).toBeNull()
  })
})
