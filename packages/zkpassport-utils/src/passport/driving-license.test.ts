import { describe, expect, test } from "bun:test"
import {
  DrivingLicenseError,
  drivingLicenseToMrz,
  mrzCheckDigit,
  parseAamvaBarcode,
} from "./driving-license"
import { parseDocumentType } from "../circuits/disclose"
import { calculateTier2PrivateNullifier } from "../circuits/attested-id"

const td1Dg1 = (mrz: string) =>
  new Uint8Array([0x61, 0x5d, 0x5f, 0x1f, 0x5a, ...new TextEncoder().encode(mrz)])

// An AAMVA version 8 California licence barcode, as Regula returns its data
const CALIFORNIA =
  "@\n\x1e\rANSI 636014080102DL00410288ZC03290024DLDAQD1234567\nDCSDOE\nDDEN\nDACJANE\nDDFN\nDADMARIE\nDDGN\nDCAC\nDCBNONE\nDCDNONE\nDBD01012020\nDBB01151990\nDBA01152028\nDBC2\nDAU065 IN\nDAYBRO\nDAG123 MAIN ST\nDAISACRAMENTO\nDAJCA\nDAK958220000  \nDCF00/00/0000NNNAN/ANFD/YY\nDCGUSA\nDDAF\nDDB01012020\r\nZCZCAA\r"

const withElement = (barcode: string, code: string, value: string) =>
  barcode.replace(new RegExp(`${code}[^\\n]*`), `${code}${value}`)

describe("driving licence", () => {
  test("reads an AAMVA barcode", () => {
    expect(parseAamvaBarcode(CALIFORNIA)).toEqual({
      country: "USA",
      subdivision: "CA",
      number: "D1234567",
      surname: "DOE",
      givenNames: "JANE MARIE",
      dateOfBirth: "1990-01-15",
      dateOfExpiry: "2028-01-15",
      sex: "F",
    })
  })

  test("reads a Canadian barcode's dates year first", () => {
    const ontario = withElement(
      withElement(
        withElement(withElement(CALIFORNIA, "DCG", "CAN"), "DAJ", "ON"),
        "DBB",
        "19900115",
      ),
      "DBA",
      "20280115",
    )
    const license = parseAamvaBarcode(ontario)
    expect(license.dateOfBirth).toBe("1990-01-15")
    expect(license.dateOfExpiry).toBe("2028-01-15")
    expect(license.subdivision).toBe("ON")
  })

  test("refuses a barcode that is not a licence's, or lacks a field", () => {
    expect(() => parseAamvaBarcode("hello")).toThrow(DrivingLicenseError)
    expect(() => parseAamvaBarcode(withElement(CALIFORNIA, "DAQ", ""))).toThrow("number")
    expect(() => parseAamvaBarcode(withElement(CALIFORNIA, "DBA", "99999999"))).toThrow("expiry")
    expect(() => parseAamvaBarcode(withElement(CALIFORNIA, "DCG", "MEX"))).toThrow("country")
  })

  test("refuses a non-driver ID card, whose only subfile is an ID one", () => {
    const idCard = CALIFORNIA.replace("080102DL00410288", "080102ID00410288").replace(
      "DLDAQ",
      "IDDAQ",
    )
    expect(() => parseAamvaBarcode(idCard)).toThrow("identification card")
  })

  test("writes an expiry past the lifetime date as it, so it stays in the circuits' window", () => {
    const arizona = withElement(CALIFORNIA, "DBA", "01152060")
    const line2 = drivingLicenseToMrz(parseAamvaBarcode(arizona)).slice(30, 60)
    expect(line2.slice(8, 15)).toBe(`551231${mrzCheckDigit("551231")}`)
  })

  test("check digits follow ICAO 9303", () => {
    // The ICAO 9303 Part 3 example
    expect(mrzCheckDigit("520727")).toBe("3")
    expect(mrzCheckDigit("D23145890")).toBe("7")
  })

  test("becomes a TD1 MRZ with the number in its overflow form and the state after it", () => {
    const mrz = drivingLicenseToMrz(parseAamvaBarcode(CALIFORNIA))
    expect(mrz).toHaveLength(90)
    const [line1, line2, line3] = [mrz.slice(0, 30), mrz.slice(30, 60), mrz.slice(60)]
    expect(line1).toBe(`DLUSAD1234567<<${mrzCheckDigit("D1234567")}<CA`.padEnd(30, "<"))
    expect(line2.slice(0, 15)).toBe(
      `900115${mrzCheckDigit("900115")}F280115${mrzCheckDigit("280115")}`,
    )
    // No nationality
    expect(line2.slice(15, 18)).toBe("<<<")
    expect(line3).toBe("DOE<<JANE<MARIE<<<<<<<<<<<<<<<")
    expect(parseDocumentType(line1.slice(0, 2))).toBe("driving_license")
  })

  test("a number longer than 9 characters continues in the optional data", () => {
    const wisconsin = withElement(withElement(CALIFORNIA, "DAQ", "D123-4567-8901-23"), "DAJ", "WI")
    const mrz = drivingLicenseToMrz(parseAamvaBarcode(wisconsin))
    expect(mrz.slice(0, 30)).toBe(
      `DLUSAD12345678<90123${mrzCheckDigit("D1234567890123")}<WI`.padEnd(30, "<"),
    )
  })

  test("the same number in two states gives two MRZs", () => {
    const nevada = withElement(CALIFORNIA, "DAJ", "NV")
    expect(drivingLicenseToMrz(parseAamvaBarcode(nevada))).not.toBe(
      drivingLicenseToMrz(parseAamvaBarcode(CALIFORNIA)),
    )
  })

  test("the same number in two states gives two nullifiers, the same licence one", async () => {
    const nevada = withElement(CALIFORNIA, "DAJ", "NV")
    const nullifier = async (barcode: string) =>
      calculateTier2PrivateNullifier(td1Dg1(drivingLicenseToMrz(parseAamvaBarcode(barcode))))
    expect(await nullifier(nevada)).not.toBe(await nullifier(CALIFORNIA))
    expect(await nullifier(CALIFORNIA)).toBe(await nullifier(CALIFORNIA))
  })
})
