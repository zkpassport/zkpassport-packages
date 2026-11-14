import { describe, expect, it } from "bun:test"
import { VerificationMethod, VerificationTier } from "@zkpassport/utils"

import { chipOnlyPolicy, isAppClipLane, isSamePage, laneFor, withLane } from "../src/verify/lane"

const REQUEST = "https://zkpassport.id/r?d=example.com&t=abc"

describe("chipOnlyPolicy", () => {
  it("is true for the default policy and for chip schemes only", () => {
    expect(chipOnlyPolicy(undefined)).toBe(true)
    expect(chipOnlyPolicy([VerificationTier.GOVERNMENT_SIGNED])).toBe(true)
    expect(chipOnlyPolicy([VerificationMethod.ICAO_CHIP])).toBe(true)
  })

  it("is false once a camera-read credential is accepted", () => {
    expect(
      chipOnlyPolicy([VerificationTier.GOVERNMENT_SIGNED, VerificationTier.DEVICE_ATTESTED]),
    ).toBe(false)
    expect(
      chipOnlyPolicy([VerificationMethod.ICAO_CHIP, VerificationMethod.ATTESTED_CAPTURE_IOS]),
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
    expect(laneFor([VerificationTier.DEVICE_ATTESTED], true, "ios")).toBe("r")
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

describe("isSamePage", () => {
  it("is true on the /c page for its own link, so the button doesn't just reopen it", () => {
    const clip = withLane(REQUEST, "c")
    expect(isSamePage(clip, "https://zkpassport.id/c?d=example.com&t=abc")).toBe(true)
    // From the popup, the /c link is another page: it opens in a new tab and invokes the clip
    expect(isSamePage(clip, "https://verify.zkpassport.id/verify?x=1")).toBe(false)
    expect(isSamePage(clip, "https://zkpassport.id/r?d=example.com")).toBe(false)
    expect(isSamePage("not a url", "https://zkpassport.id/c")).toBe(false)
  })
})
