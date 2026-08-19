import { DisclosedData, getDisclosedBytesFromMrzAndMask } from "../src/circuits/disclose"
import { getNationality } from "../src/passport/getters"
import { normalizeCountryCode } from "../src/country/country"
import type { PassportViewModel } from "../src/types"

// German documents carry "D<<" in the MRZ nationality and issuing country fields instead of the
// ISO alpha-3 code "DEU". The circuits, the app and the query builder all use "DEU", so the
// disclosed data parsed out of a proof has to normalize it too, or verification fails.
const GERMAN_PASSPORT_MRZ =
  "P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4"
const GERMAN_ID_CARD_MRZ =
  "IDD<<L01X00T471<<<<<<<<<<<<<<<6408125F2702283D<<<<<<<<<<<<<4MUSTERMANN<<ERIKA<<<<<<<<<<<<<"

const disclose = (mrz: string, ...ranges: [number, number][]) => {
  const mask = new Array(90).fill(0)
  for (const [start, end] of ranges) mask.fill(1, start, end)
  return getDisclosedBytesFromMrzAndMask(mrz, mask)
}

describe("German country code normalization", () => {
  it("normalizes D<< to DEU and leaves other codes untouched", () => {
    expect(normalizeCountryCode("D<<")).toBe("DEU")
    expect(normalizeCountryCode("FRA")).toBe("FRA")
    expect(normalizeCountryCode("")).toBe("")
  })

  describe("passports (TD3)", () => {
    it("the MRZ really holds D<< at the nationality and issuing country offsets", () => {
      expect(GERMAN_PASSPORT_MRZ.length).toBe(88)
      expect(GERMAN_PASSPORT_MRZ.slice(2, 5)).toBe("D<<")
      expect(GERMAN_PASSPORT_MRZ.slice(54, 57)).toBe("D<<")
    })

    it("discloses the nationality as DEU", () => {
      const bytes = disclose(GERMAN_PASSPORT_MRZ, [54, 57])
      expect(DisclosedData.fromDisclosedBytes(bytes, "passport").nationality).toBe("DEU")
    })

    it("discloses the issuing country as DEU", () => {
      const bytes = disclose(GERMAN_PASSPORT_MRZ, [2, 5])
      expect(DisclosedData.fromDisclosedBytes(bytes, "passport").issuingCountry).toBe("DEU")
    })

    it("getNationality returns DEU", () => {
      expect(getNationality({ mrz: GERMAN_PASSPORT_MRZ } as PassportViewModel)).toBe("DEU")
    })
  })

  describe("id cards (TD1)", () => {
    it("the MRZ really holds D<< at the nationality and issuing country offsets", () => {
      expect(GERMAN_ID_CARD_MRZ.length).toBe(90)
      expect(GERMAN_ID_CARD_MRZ.slice(2, 5)).toBe("D<<")
      expect(GERMAN_ID_CARD_MRZ.slice(45, 48)).toBe("D<<")
    })

    it("discloses the nationality as DEU", () => {
      const bytes = disclose(GERMAN_ID_CARD_MRZ, [45, 48])
      expect(DisclosedData.fromDisclosedBytes(bytes, "id_card").nationality).toBe("DEU")
    })

    it("discloses the issuing country as DEU", () => {
      const bytes = disclose(GERMAN_ID_CARD_MRZ, [2, 5])
      expect(DisclosedData.fromDisclosedBytes(bytes, "id_card").issuingCountry).toBe("DEU")
    })

    it("getNationality returns DEU", () => {
      expect(getNationality({ mrz: GERMAN_ID_CARD_MRZ } as PassportViewModel)).toBe("DEU")
    })
  })

  it("non-German documents keep their alpha-3 code", () => {
    const frenchMRZ =
      "P<FRAMARTIN<<MARIE<<<<<<<<<<<<<<<<<<<<<<<<<<12AB345670FRA6408125F2702283<<<<<<<<<<<<<<<4"
    const bytes = disclose(frenchMRZ, [2, 5], [54, 57])
    const data = DisclosedData.fromDisclosedBytes(bytes, "passport")
    expect(data.nationality).toBe("FRA")
    expect(data.issuingCountry).toBe("FRA")
  })
})
