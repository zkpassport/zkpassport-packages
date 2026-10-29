import { describe, expect, it } from "bun:test"
import { CredentialScheme, CredentialTier } from "@zkpassport/utils"

import { chipOnlyPolicy, isAppClipLane, laneFor, withLane } from "../src/verify/lane"

const REQUEST = "https://zkpassport.id/r?d=example.com&t=abc"

describe("chipOnlyPolicy", () => {
  it("is true for the default policy and for chip schemes only", () => {
    expect(chipOnlyPolicy(undefined)).toBe(true)
    expect(chipOnlyPolicy([CredentialTier.GOVERNMENT_SIGNED])).toBe(true)
    expect(chipOnlyPolicy([CredentialScheme.ICAO_CHIP])).toBe(true)
  })

  it("is false once a camera-read credential is accepted", () => {
    expect(chipOnlyPolicy([CredentialTier.GOVERNMENT_SIGNED, CredentialTier.DEVICE_ATTESTED])).toBe(
      false,
    )
    expect(
      chipOnlyPolicy([CredentialScheme.ICAO_CHIP, CredentialScheme.ATTESTED_CAPTURE_IOS]),
    ).toBe(false)
  })
})

describe("laneFor", () => {
  it("sends a chip-only request to the App Clip when allowed and the phone is not Android", () => {
    expect(laneFor(undefined, true, "ios")).toBe("c")
    expect(laneFor(undefined, true, "unknown")).toBe("c")
  })

  it("keeps the full app otherwise", () => {
    expect(laneFor(undefined, false, "ios")).toBe("r")
    expect(laneFor(undefined, true, "android")).toBe("r")
    expect(laneFor([CredentialTier.DEVICE_ATTESTED], true, "ios")).toBe("r")
  })
})

describe("withLane / isAppClipLane", () => {
  it("swaps the path and keeps the query", () => {
    const clip = withLane(REQUEST, "c")
    expect(clip).toBe("https://zkpassport.id/c?d=example.com&t=abc")
    expect(isAppClipLane(clip)).toBe(true)
    expect(isAppClipLane(withLane(clip, "r"))).toBe(false)
    expect(isAppClipLane(null)).toBe(false)
    expect(isAppClipLane("not a url")).toBe(false)
  })
})
