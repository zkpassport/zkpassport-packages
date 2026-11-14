import { describe, expect, test } from "bun:test"
import { PrintedIdError, printedIdToMrz, type PrintedIdFields } from "./printed-id"
import { completeDocumentDate, LIFETIME_EXPIRY_DATE, mrzCheckDigit } from "./td1"
import { parseDocumentType } from "../circuits/disclose"
import { calculateTier2PrivateNullifier } from "../circuits/attested-id"

const td1Dg1 = (mrz: string) =>
  new Uint8Array([0x61, 0x5d, 0x5f, 0x1f, 0x5a, ...new TextEncoder().encode(mrz)])

// A Chinese resident identity card: 18-character number, valid for life
const CHINA: PrintedIdFields = {
  issuingCountry: "CHN",
  nationalityRule: "issuer",
  number: "11010519491231002X",
  surname: "WANG",
  givenNames: "XIAOMING",
  dateOfBirth: { year: 1949, month: 12, day: 31 },
  dateOfExpiry: { lifetime: true },
  sex: "M",
}

const lines = (mrz: string) => [mrz.slice(0, 30), mrz.slice(30, 60), mrz.slice(60)]

describe("national IDs read from their printed text", () => {
  test("become a TD1 MRZ that discloses as an ID card", () => {
    const mrz = printedIdToMrz(CHINA)
    expect(mrz).toHaveLength(90)
    const [line1, line2, line3] = lines(mrz)
    // A long number takes the overflow form, its check digit after the rest of it
    expect(line1).toBe(
      `IDCHN110105194<91231002X${mrzCheckDigit("11010519491231002X")}`.padEnd(30, "<"),
    )
    expect(line2.slice(0, 15)).toBe(
      `491231${mrzCheckDigit("491231")}M551231${mrzCheckDigit("551231")}`,
    )
    expect(line2.slice(15, 18)).toBe("CHN")
    expect(line3).toBe("WANG<<XIAOMING".padEnd(30, "<"))
    expect(parseDocumentType(line1.slice(0, 2))).toBe("id_card")
  })

  test("a short number fills the document number field with its check digit", () => {
    const mrz = printedIdToMrz({ ...CHINA, number: "AB-123 456" })
    expect(mrz.slice(0, 30)).toBe(`IDCHNAB123456<${mrzCheckDigit("AB123456")}`.padEnd(30, "<"))
  })

  test("nationality: the issuer, the printed one, or none", () => {
    const nationality = (fields: Partial<PrintedIdFields>) =>
      printedIdToMrz({ ...CHINA, ...fields }).slice(45, 48)
    expect(nationality({ nationalityRule: "issuer" })).toBe("CHN")
    expect(nationality({ nationalityRule: "printed", printedNationality: "ind" })).toBe("IND")
    expect(nationality({ nationalityRule: "printed" })).toBe("<<<")
    expect(nationality({ nationalityRule: "printed", printedNationality: "India" })).toBe("<<<")
    expect(nationality({ nationalityRule: "none" })).toBe("<<<")
  })

  test("refuses a card missing a required field", () => {
    expect(() => printedIdToMrz({ ...CHINA, number: "-" })).toThrow(PrintedIdError)
    expect(() => printedIdToMrz({ ...CHINA, surname: "", givenNames: "" })).toThrow("name")
    expect(() => printedIdToMrz({ ...CHINA, dateOfBirth: {} })).toThrow("date of birth")
    expect(() => printedIdToMrz({ ...CHINA, dateOfExpiry: {} })).toThrow("expiry date")
    expect(() => printedIdToMrz({ ...CHINA, number: "A".repeat(24) })).toThrow("too long")
  })

  test("the same card always gives the same nullifier, whatever its expiry", async () => {
    const nullifier = async (fields: PrintedIdFields) =>
      calculateTier2PrivateNullifier(td1Dg1(printedIdToMrz(fields)))
    expect(await nullifier(CHINA)).toBe(await nullifier(CHINA))
    // The expiry may come from a side the scan can't tie to the holder: it is no part of it
    const otherExpiry = { ...CHINA, dateOfExpiry: { year: 2040, month: 5, day: 1 } }
    expect(await nullifier(otherExpiry)).toBe(await nullifier(CHINA))
    expect(await nullifier({ ...CHINA, number: "11010519491231003X" })).not.toBe(
      await nullifier(CHINA),
    )
    // The name is not part of it
    expect(await nullifier({ ...CHINA, givenNames: "XIAO MING" })).toBe(await nullifier(CHINA))
  })
})

describe("completing printed dates", () => {
  test("a lifetime expiry is fixed", () => {
    expect(completeDocumentDate({ lifetime: true }, "expiry")).toBe(LIFETIME_EXPIRY_DATE)
  })

  test("a year alone: 1 January for an expiry, 31 December for a birth date", () => {
    expect(completeDocumentDate({ year: 2031 }, "expiry")).toBe("2031-01-01")
    expect(completeDocumentDate({ year: 1990 }, "birth")).toBe("1990-12-31")
  })

  test("a year and month: the first day for an expiry, the last for a birth date", () => {
    expect(completeDocumentDate({ year: 2031, month: 6 }, "expiry")).toBe("2031-06-01")
    expect(completeDocumentDate({ year: 2000, month: 2 }, "birth")).toBe("2000-02-29")
  })

  test("refuses what is not a date", () => {
    expect(completeDocumentDate({}, "birth")).toBeNull()
    expect(completeDocumentDate({ year: 1990, month: 13 }, "birth")).toBeNull()
    expect(completeDocumentDate({ year: 1990, month: 2, day: 30 }, "birth")).toBeNull()
    // A lifetime birth date means nothing
    expect(completeDocumentDate({ lifetime: true }, "birth")).toBeNull()
  })
})
