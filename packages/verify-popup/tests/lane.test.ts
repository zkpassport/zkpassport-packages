import { describe, expect, it } from "bun:test"
import { NullifierType, VerificationMethod, VerificationTier } from "@zkpassport/utils"

import {
  MIN_STALLED_ATTEMPT_MS,
  STALLED_ATTEMPTS_BEFORE_APP_LANE,
  isAppClipLane,
  isSafariUserAgent,
  isStalledAttempt,
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

describe("isStalledAttempt", () => {
  it("ignores a restart too quick to follow a real attempt", () => {
    expect(isStalledAttempt(1_000, 1_000 + MIN_STALLED_ATTEMPT_MS - 1)).toBe(false)
    expect(isStalledAttempt(1_000, 1_000 + MIN_STALLED_ATTEMPT_MS)).toBe(true)
    expect(isStalledAttempt(null, 1_000_000)).toBe(false)
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

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)"
const SAFARI = `${IPHONE} Version/18.5 Mobile/15E148 Safari/604.1`
const CHROME = `${IPHONE} CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1`
const FIREFOX = `${IPHONE} FxiOS/139.0 Mobile/15E148 Safari/605.1.15`
const EDGE = `${IPHONE} Version/18.0 EdgiOS/138.0.3351.83 Mobile/15E148 Safari/605.1.15`

describe("isSafariUserAgent", () => {
  it("accepts Safari, also an iPad that asks for desktop sites", () => {
    expect(isSafariUserAgent(SAFARI)).toBe(true)
    const ipadDesktop =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15"
    expect(isSafariUserAgent(ipadDesktop)).toBe(true)
  })

  it("rejects other iOS browsers, which cannot show the App Clip card", () => {
    expect(isSafariUserAgent(CHROME)).toBe(false)
    expect(isSafariUserAgent(FIREFOX)).toBe(false)
    expect(isSafariUserAgent(EDGE)).toBe(false)
  })
})
