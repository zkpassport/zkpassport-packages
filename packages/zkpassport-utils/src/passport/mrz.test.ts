// ICAO Doc 9303 Part 4 (TD3): writing identity attributes into MRZ fields.
import { describe, expect, test } from "bun:test"
import {
  dateToMrz,
  documentNumberToMrz,
  formatMrzName,
  MRZ_NAME_LENGTH,
  namePartToMrz,
} from "./mrz"

describe("name field (§4.2.2)", () => {
  test("primary identifier, two fillers, secondary identifier, filler-padded to 39", () => {
    const mrz = formatMrzName("Doe", "John")
    expect(mrz).toBe("DOE<<JOHN".padEnd(39, "<"))
    expect(mrz.length).toBe(MRZ_NAME_LENGTH)
  })

  test("spaces and hyphens inside an identifier become single fillers; periods are omitted", () => {
    expect(namePartToMrz("Mary Ann J.")).toBe("MARY<ANN<J")
    expect(formatMrzName("Al-Sample", "Mary Ann J.")).toBe("AL<SAMPLE<<MARY<ANN<J".padEnd(39, "<"))
  })

  test("names longer than the field are truncated to 39 characters", () => {
    const mrz = formatMrzName("Wolfeschlegelsteinhausen", "Maximilianus Bartholomeus")
    expect(mrz).toBe("WOLFESCHLEGELSTEINHAUSEN<<MAXIMILIANUS<")
    expect(mrz.length).toBe(39)
  })
})

describe("date field (§4.2.2.2)", () => {
  test("YYMMDD from an ISO date, month and day zero-padded", () => {
    expect(dateToMrz("1975-03-07")).toBe("750307")
    expect(dateToMrz("2001-11-30")).toBe("011130")
    expect(dateToMrz("2001-1-5")).toBe("010105")
  })

  test("rejects partial dates", () => {
    expect(() => dateToMrz("1975")).toThrow("Expected an ISO YYYY-MM-DD date")
    expect(() => dateToMrz("1975-03")).toThrow("Expected an ISO YYYY-MM-DD date")
  })
})

describe("document number field (§4.2.2.2)", () => {
  test("9 characters, filler-padded", () => {
    expect(documentNumberToMrz("AB123")).toBe("AB123<<<<")
    expect(documentNumberToMrz("L898902C3")).toBe("L898902C3")
  })

  test("longer numbers keep only the first 9 characters, as the MRZ does", () => {
    expect(documentNumberToMrz("1234567890123")).toBe("123456789")
  })
})
