import { describe, expect, it } from "bun:test"
import { NullifierType, VerificationMethod, VerificationTier } from "@zkpassport/utils"

import {
  STALLED_ATTEMPTS_BEFORE_APP_LANE,
  isAppClipLane,
  isSamePage,
  laneFor,
  withLane,
} from "../src/verify/lane"

const REQUEST = "https://zkpassport.id/r?d=example.com&t=abc"

describe("laneFor", () => {
  it("sends a request that accepts chip reads to the App Clip", () => {
    expect(laneFor({}, "ios")).toBe("c")
    expect(laneFor({}, "unknown")).toBe("c")
    expect(laneFor({ allowedVerificationMethods: [VerificationMethod.ICAO_CHIP] }, "ios")).toBe("c")
    expect(laneFor({ uniqueIdentifierType: NullifierType.NON_SALTED }, "ios")).toBe("c")
    expect(laneFor({ uniqueIdentifierType: NullifierType.NONE }, "ios")).toBe("c")
  })

  it("also when it accepts camera reads too: the clip sends those IDs to the full app", () => {
    const chipAndCamera = [VerificationTier.GOVERNMENT_SIGNED, VerificationTier.DEVICE_ATTESTED]
    expect(laneFor({ allowedVerificationMethods: chipAndCamera }, "ios")).toBe("c")
  })

  it("keeps the full app for a request the clip can never finish", () => {
    const cameraOnly = [VerificationTier.DEVICE_ATTESTED]
    const aadhaarOnly = [VerificationMethod.UIDAI_AADHAAR]
    expect(laneFor({}, "android")).toBe("r")
    expect(laneFor({ allowedVerificationMethods: cameraOnly }, "ios")).toBe("r")
    expect(laneFor({ allowedVerificationMethods: aadhaarOnly }, "ios")).toBe("r")
    expect(laneFor({ uniqueIdentifierType: NullifierType.SALTED }, "ios")).toBe("r")
  })

  it("leaves the App Clip once enough attempts have stalled", () => {
    expect(laneFor({}, "ios", STALLED_ATTEMPTS_BEFORE_APP_LANE - 1)).toBe("c")
    expect(laneFor({}, "ios", STALLED_ATTEMPTS_BEFORE_APP_LANE)).toBe("r")
    expect(laneFor({}, "unknown", STALLED_ATTEMPTS_BEFORE_APP_LANE + 3)).toBe("r")
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
