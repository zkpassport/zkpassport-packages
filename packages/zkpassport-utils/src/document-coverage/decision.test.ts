import { describe, expect, test } from "bun:test"
import { CredentialScheme, CredentialTier } from "../types/credential"
import {
  decideVerificationPaths,
  listCountries,
  listDocumentTypes,
  seriesInCirculation,
} from "./decision"
import { BUNDLED_COVERAGE, isCoverage, loadCoverage } from "./loader"
import type { Coverage, CoverageCountry, CoverageDocument } from "./types"

const IOS = [CredentialScheme.ICAO_CHIP, CredentialScheme.ATTESTED_CAPTURE_IOS]
const ANDROID = [CredentialScheme.ICAO_CHIP]
const SIGNED_ONLY = [CredentialTier.GOVERNMENT_SIGNED]
const ANY = [CredentialTier.GOVERNMENT_SIGNED, CredentialTier.DEVICE_ATTESTED]

const passport = (overrides: Partial<CoverageDocument>): CoverageDocument => ({
  type: "passport",
  name: "Passport",
  chip: false,
  mrz: true,
  ...overrides,
})

const country = (
  documents: CoverageDocument[],
  chipCertificates: CoverageCountry["chipCertificates"] = { supported: true, from: 2010, to: 2040 },
): CoverageCountry => ({
  name: "Testland",
  chipCertificates,
  signedSupport: { passport: 1, id_card: 0, residence_permit: 0 },
  documents,
})

const table = (countries: Record<string, CoverageCountry>): Coverage => ({
  ...BUNDLED_COVERAGE,
  countries,
})

const methods = (decision: ReturnType<typeof decideVerificationPaths>) =>
  decision.paths.map((p) => `${p.method}:${p.scheme}`)

describe("decideVerificationPaths", () => {
  const chipped = table({ TST: country([passport({ name: "ePassport (2015)", from: 2015, chip: true })]) })
  const chipless = table({ TST: country([passport({ name: "Passport (2015)", from: 2015 })]) })
  const mixed = table({
    TST: country([
      passport({ name: "Passport (2008)", from: 2008 }),
      passport({ name: "ePassport (2024)", from: 2024, chip: true }),
    ]),
  })

  test("a verifiable chip comes first, the camera is the fallback", () => {
    const decision = decideVerificationPaths(chipped, {
      country: "TST",
      documentType: "passport",
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(decision.outcome).toBe("proceed")
    expect(methods(decision)).toEqual(["nfc:100", "camera:200"])
    expect(decision.chip).toBe("all")
    expect(decision.chipVerifiable).toBe(true)
  })

  test("a signed-only policy leaves the chip read alone and reports the refused camera read", () => {
    const decision = decideVerificationPaths(chipped, {
      country: "TST",
      documentType: "passport",
      allowedCredentials: SIGNED_ONLY,
      supportedSchemes: IOS,
    })
    expect(methods(decision)).toEqual(["nfc:100"])
    expect(decision.refusedByPolicy.map((p) => p.scheme)).toEqual([
      CredentialScheme.ATTESTED_CAPTURE_IOS,
    ])
  })

  test("the default policy is signed only", () => {
    const decision = decideVerificationPaths(chipless, {
      country: "TST",
      documentType: "passport",
      supportedSchemes: IOS,
    })
    expect(decision.outcome).toBe("rejected_by_policy")
    expect(decision.paths).toEqual([])
    expect(decision.refusedByPolicy.map((p) => p.method)).toEqual(["camera"])
  })

  test("a chipless passport goes to the camera when the policy allows it", () => {
    const decision = decideVerificationPaths(chipless, {
      country: "TST",
      documentType: "passport",
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(decision.outcome).toBe("proceed")
    expect(methods(decision)).toEqual(["camera:200"])
    expect(decision.chip).toBe("none")
  })

  test("a chip we have no certificate for is read by camera instead", () => {
    const noCerts = table({
      TST: country([passport({ from: 2015, chip: true })], { supported: false, from: null, to: null }),
    })
    const decision = decideVerificationPaths(noCerts, {
      country: "TST",
      documentType: "passport",
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(methods(decision)).toEqual(["camera:200"])
    expect(decision.chipVerifiable).toBe(false)
  })

  test("a chip issued before our certificates start is not verifiable", () => {
    const decision = decideVerificationPaths(chipped, {
      country: "TST",
      documentType: "passport",
      issueYear: 2016,
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(decision.chipVerifiable).toBe(true)
    const early = decideVerificationPaths(
      table({ TST: country([passport({ from: 2005, chip: true })], { supported: true, from: 2010, to: 2040 }) }),
      { country: "TST", documentType: "passport", issueYear: 2008, allowedCredentials: ANY, supportedSchemes: IOS },
    )
    expect(early.chipVerifiable).toBe(false)
    expect(methods(early)).toEqual(["camera:200"])
  })

  test("a country with both kinds in circulation asks for the issue year", () => {
    const decision = decideVerificationPaths(mixed, {
      country: "TST",
      documentType: "passport",
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(decision.outcome).toBe("ask_issue_year")
    expect(decision.chip).toBe("mixed")
    expect(methods(decision)).toEqual(["nfc:100", "camera:200"])
  })

  test("the issue year picks the series", () => {
    const old = decideVerificationPaths(mixed, {
      country: "TST",
      documentType: "passport",
      issueYear: 2019,
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(old.outcome).toBe("proceed")
    expect(old.documents.map((d) => d.name)).toEqual(["Passport (2008)"])
    expect(methods(old)).toEqual(["camera:200"])

    const recent = decideVerificationPaths(mixed, {
      country: "TST",
      documentType: "passport",
      issueYear: 2025,
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(recent.documents.map((d) => d.name)).toEqual(["ePassport (2024)"])
    expect(methods(recent)).toEqual(["nfc:100", "camera:200"])
  })

  test("a client that cannot prove a camera read gets no camera path", () => {
    const decision = decideVerificationPaths(chipless, {
      country: "TST",
      documentType: "passport",
      allowedCredentials: ANY,
      supportedSchemes: ANDROID,
    })
    expect(decision.outcome).toBe("unsupported")
    expect(decision.refusedByPolicy).toEqual([])
  })

  test("a passport with neither chip nor MRZ is unsupported", () => {
    const decision = decideVerificationPaths(
      table({ TST: country([passport({ mrz: false })]) }),
      { country: "TST", documentType: "passport", allowedCredentials: ANY, supportedSchemes: IOS },
    )
    expect(decision.outcome).toBe("unsupported")
  })

  test("a document listed ahead of our support is unsupported", () => {
    const decision = decideVerificationPaths(
      table({ IND: country([{ type: "aadhaar", name: "Aadhaar", chip: false, mrz: false, available: false }]) }),
      { country: "IND", documentType: "aadhaar", allowedCredentials: ANY, supportedSchemes: [CredentialScheme.UIDAI_AADHAAR] },
    )
    expect(decision.outcome).toBe("unsupported")
  })

  test("an unknown country or document type is unknown", () => {
    expect(
      decideVerificationPaths(chipped, { country: "XXX", documentType: "passport", supportedSchemes: IOS }).outcome,
    ).toBe("unknown")
    expect(
      decideVerificationPaths(chipped, { country: "TST", documentType: "aadhaar", supportedSchemes: IOS }).outcome,
    ).toBe("unsupported")
  })

  test("the bundled table sends an Indian passport to the camera and a Japanese one to the chip", () => {
    const india = decideVerificationPaths(BUNDLED_COVERAGE, {
      country: "IND",
      documentType: "passport",
      issueYear: 2019,
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(india.outcome).toBe("proceed")
    expect(methods(india)).toEqual(["camera:200"])

    const japan = decideVerificationPaths(BUNDLED_COVERAGE, {
      country: "JPN",
      documentType: "passport",
      allowedCredentials: ANY,
      supportedSchemes: IOS,
    })
    expect(japan.outcome).toBe("proceed")
    expect(methods(japan)).toEqual(["nfc:100", "camera:200"])
  })
})

describe("seriesInCirculation", () => {
  const series = [
    passport({ name: "A", from: 2000, to: 2006 }),
    passport({ name: "B", from: 2008 }),
    passport({ name: "C", from: 2015, deprecated: true }),
    passport({ name: "D" }),
  ]

  test("a series runs to its last year or the next series' first", () => {
    expect(seriesInCirculation(series, 2003).map((d) => d.name)).toEqual(["A"])
    expect(seriesInCirculation(series, 2007).map((d) => d.name)).toEqual(["D"])
    expect(seriesInCirculation(series, 2010).map((d) => d.name)).toEqual(["B"])
    expect(seriesInCirculation(series, 2020).map((d) => d.name)).toEqual(["C"])
  })

  test("without a year, the maintained series count", () => {
    expect(seriesInCirculation(series).map((d) => d.name)).toEqual(["A", "B", "D"])
    expect(seriesInCirculation([passport({ name: "C", deprecated: true })]).map((d) => d.name)).toEqual(["C"])
  })
})

describe("listDocumentTypes and listCountries", () => {
  test("lists a country's document types with their shape and chip mix", () => {
    const options = listDocumentTypes(BUNDLED_COVERAGE, "IND")
    expect(options.map((o) => o.type)).toEqual(["passport", "aadhaar"])
    expect(options[0]).toMatchObject({ shape: { aspectRatio: 1.42 }, available: true, mixedChip: true })
    expect(options[1]).toMatchObject({ available: false })
    expect(listDocumentTypes(BUNDLED_COVERAGE, "XXX")).toEqual([])
  })

  test("lists the countries by name", () => {
    const countries = listCountries(BUNDLED_COVERAGE)
    expect(countries.length).toBeGreaterThan(200)
    expect(countries.find((c) => c.code === "IND")).toEqual({ code: "IND", name: "India" })
    expect([...countries].sort((a, b) => a.name.localeCompare(b.name))).toEqual(countries)
  })
})

describe("loadCoverage", () => {
  const remote = { ...BUNDLED_COVERAGE, generatedAt: "2099-01-01T00:00:00.000Z" }
  const respond = (body: unknown, ok = true) =>
    (async () => ({ ok, json: async () => body })) as unknown as typeof fetch

  test("uses the CDN's table when it is newer", async () => {
    const loaded = await loadCoverage({ fetch: respond(remote) })
    expect(loaded.source).toBe("remote")
    expect(loaded.coverage.generatedAt).toBe(remote.generatedAt)
  })

  test("keeps the bundled table when the CDN's is older, malformed or unreachable", async () => {
    const older = { ...BUNDLED_COVERAGE, generatedAt: "2000-01-01T00:00:00.000Z" }
    expect((await loadCoverage({ fetch: respond(older) })).source).toBe("bundled")
    expect((await loadCoverage({ fetch: respond({ hello: 1 }) })).source).toBe("bundled")
    expect((await loadCoverage({ fetch: respond(remote, false) })).source).toBe("bundled")
    const failing = (async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch
    expect((await loadCoverage({ fetch: failing })).source).toBe("bundled")
  })

  test("the bundled table is well formed", () => {
    expect(isCoverage(BUNDLED_COVERAGE)).toBe(true)
    expect(isCoverage(null)).toBe(false)
  })
})
