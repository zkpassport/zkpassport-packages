import { describe, expect, test } from "bun:test"
import type { AttestPolicy } from "@zkpassport/sdk"
import { disclosureClaims, HIDDEN_NOTE } from "../lib/disclosure"

const basePolicy: AttestPolicy = {
  owner: "0x1111111111111111111111111111111111111111",
  validityPeriod: 0n,
  unique: false,
  saltedNullifierOnly: false,
  minAge: 0,
  sanctionsCheck: false,
  excludedCountries: [],
  metadataURL: "",
  hook: "0x2222222222222222222222222222222222222222",
  retiredAt: 0n,
}

describe("disclosureClaims", () => {
  test("empty policy yields no claims", () => {
    expect(disclosureClaims(basePolicy)).toEqual([])
  })

  test("minAge yields an age claim", () => {
    expect(disclosureClaims({ ...basePolicy, minAge: 18 })).toEqual(["You are 18 or older"])
  })

  test("excluded countries render display names", () => {
    const [claim] = disclosureClaims({ ...basePolicy, excludedCountries: ["IRN", "PRK"] })
    expect(claim).toContain("Your nationality is not")
    expect(claim).toContain("Iran")
    expect(claim).toContain("Korea")
  })

  test("unknown country codes fall back to the code", () => {
    const [claim] = disclosureClaims({ ...basePolicy, excludedCountries: ["XXX"] })
    expect(claim).toContain("XXX")
  })

  test("sanctions and salted-nullifier flags yield their claims", () => {
    expect(disclosureClaims({ ...basePolicy, sanctionsCheck: true })).toEqual([
      "You are not on sanctions lists",
    ])
    expect(disclosureClaims({ ...basePolicy, saltedNullifierOnly: true })).toEqual([
      "One credential per person (face match required)",
    ])
  })

  test("full policy yields all claims in a fixed order", () => {
    const claims = disclosureClaims({
      ...basePolicy,
      minAge: 21,
      excludedCountries: ["IRN"],
      sanctionsCheck: true,
      saltedNullifierOnly: true,
    })
    expect(claims).toHaveLength(4)
    expect(claims[0]).toBe("You are 21 or older")
    expect(claims[3]).toBe("One credential per person (face match required)")
  })

  test("hidden note names what never leaves the device", () => {
    expect(HIDDEN_NOTE).toContain("stay on your device")
  })
})
