import { describe, expect, test } from "bun:test"
import { BUNDLED_COVERAGE, CredentialTier } from "@zkpassport/utils"
import {
  canContinue,
  EMPTY_TRIAGE,
  isAppClipLane,
  laneFor,
  requestUrlFor,
  triageVerdict,
  withLane,
  withTriage,
} from "../src/verify/triage"

const ANY = [CredentialTier.GOVERNMENT_SIGNED, CredentialTier.DEVICE_ATTESTED]
const SIGNED = [CredentialTier.GOVERNMENT_SIGNED]
const url = "https://zkpassport.id/r?d=demo.zkpassport.id&t=topic&p=key"

describe("triageVerdict", () => {
  test("says nothing until a document and its country are chosen", () => {
    expect(triageVerdict(BUNDLED_COVERAGE, EMPTY_TRIAGE, ANY, "ios").kind).toBe("unknown")
    expect(
      triageVerdict(
        BUNDLED_COVERAGE,
        { country: null, documentType: "passport", hasChip: null },
        ANY,
        "ios",
      ).kind,
    ).toBe("unknown")
    expect(
      triageVerdict(
        BUNDLED_COVERAGE,
        { country: "IND", documentType: "id_card", hasChip: null },
        ANY,
        "ios",
      ).kind,
    ).not.toBe("unknown")
  })

  test("a card goes through the table like a passport", () => {
    // A UAE ID card has no chip the app reads and an MRZ on its back
    const uae = triageVerdict(
      BUNDLED_COVERAGE,
      { country: "ARE", documentType: "id_card", hasChip: null },
      ANY,
      "ios",
    )
    expect(uae.kind).toBe("camera")
    const signedOnly = triageVerdict(
      BUNDLED_COVERAGE,
      { country: "ARE", documentType: "id_card", hasChip: null },
      SIGNED,
      "ios",
    )
    expect(signedOnly).toMatchObject({ kind: "blocked", reason: "chipless" })
  })

  test("asks whether an Indian passport has a chip, then sends it to the chip or the camera", () => {
    const asked = triageVerdict(
      BUNDLED_COVERAGE,
      { country: "IND", documentType: "passport", hasChip: null },
      ANY,
      "ios",
    )
    expect(asked.kind).toBe("ask_chip")
    expect(canContinue(asked)).toBe(false)

    const withChip = triageVerdict(
      BUNDLED_COVERAGE,
      { country: "IND", documentType: "passport", hasChip: true },
      ANY,
      "ios",
    )
    expect(withChip.kind).toBe("chip")

    const without = triageVerdict(
      BUNDLED_COVERAGE,
      { country: "IND", documentType: "passport", hasChip: false },
      ANY,
      "ios",
    )
    expect(without.kind).toBe("camera")
  })

  test("blocks a chipless passport for a request that wants a chip, with the reason", () => {
    const verdict = triageVerdict(
      BUNDLED_COVERAGE,
      { country: "IND", documentType: "passport", hasChip: false },
      SIGNED,
      "ios",
    )
    expect(verdict).toMatchObject({ kind: "blocked", reason: "chipless" })
    expect(canContinue(verdict)).toBe(false)
  })

  test("an Android phone has no camera read", () => {
    const verdict = triageVerdict(
      BUNDLED_COVERAGE,
      { country: "IND", documentType: "passport", hasChip: false },
      ANY,
      "android",
    )
    expect(verdict).toMatchObject({ kind: "blocked", reason: "unsupported" })
  })

  test("a chip passport goes to its chip without a question", () => {
    const verdict = triageVerdict(
      BUNDLED_COVERAGE,
      { country: "JPN", documentType: "passport", hasChip: null },
      SIGNED,
      "unknown",
    )
    expect(verdict.kind).toBe("chip")
  })
})

describe("request URL", () => {
  const chip = triageVerdict(
    BUNDLED_COVERAGE,
    { country: "JPN", documentType: "passport", hasChip: null },
    SIGNED,
    "ios",
  )

  test("carries what the user said", () => {
    const carried = new URL(
      withTriage(url, { country: "IND", documentType: "passport", hasChip: false }),
    )
    expect(carried.searchParams.get("dc")).toBe("IND")
    expect(carried.searchParams.get("dd")).toBe("passport")
    expect(carried.searchParams.get("dh")).toBe("0")
    expect(carried.searchParams.get("t")).toBe("topic")
    expect(withTriage(url, EMPTY_TRIAGE)).toBe(url)
  })

  test("takes the App Clip lane only for a chip read the relying party allows, off Android", () => {
    expect(laneFor(chip, true, "ios")).toBe("c")
    expect(laneFor(chip, true, "unknown")).toBe("c")
    expect(laneFor(chip, true, "android")).toBe("r")
    expect(laneFor(chip, false, "ios")).toBe("r")
    expect(laneFor({ kind: "unknown" }, true, "ios")).toBe("r")
    expect(laneFor({ kind: "card" }, true, "ios")).toBe("r")
  })

  test("rewrites the lane and keeps the rest", () => {
    expect(withLane(url, "c")).toBe(url.replace("/r?", "/c?"))
    expect(withLane(withLane(url, "c"), "r")).toBe(url)
    expect(isAppClipLane(withLane(url, "c"))).toBe(true)
    expect(isAppClipLane(url)).toBe(false)
    expect(isAppClipLane(null)).toBe(false)
  })

  test("builds the final URL", () => {
    const final = new URL(
      requestUrlFor(url, { country: "JPN", documentType: "passport", hasChip: null }, chip, {
        appClipAllowed: true,
        os: "ios",
      }),
    )
    expect(final.pathname).toBe("/c")
    expect(final.searchParams.get("dc")).toBe("JPN")
  })
})
