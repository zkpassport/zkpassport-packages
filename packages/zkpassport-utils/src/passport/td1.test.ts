import { describe, expect, test } from "bun:test"
import { fieldsToTd1Mrz, nameToMrz } from "./td1"

describe("nameToMrz", () => {
  test("writes letters as ICAO 9303 transliterates them, as an issuer's MRZ does", () => {
    expect(nameToMrz("Müller")).toBe("MUELLER")
    expect(nameToMrz("Sørensen")).toBe("SOERENSEN")
    expect(nameToMrz("Åsa Öberg")).toBe("AASA<OEBERG")
    expect(nameToMrz("Strauß")).toBe("STRAUSS")
    expect(nameToMrz("Þórðarson")).toBe("THORDARSON")
    expect(nameToMrz("Łukasz")).toBe("LUKASZ")
    // An umlaut written as a combining mark is the same letter
    expect(nameToMrz("Müller")).toBe("MUELLER")
  })

  test("drops other accents and separates name parts with a filler", () => {
    expect(nameToMrz("José-María Núñez")).toBe("JOSE<MARIA<NUNEZ")
    expect(nameToMrz("  O'Brien ")).toBe("O<BRIEN")
  })
})

describe("fieldsToTd1Mrz", () => {
  const fields = {
    documentCode: "ID",
    issuingCountry: "UTO",
    nationality: "UTO",
    number: "D23145890",
    dateOfBirth: "1974-08-12",
    dateOfExpiry: "2032-04-15",
    sex: "F",
    surname: "Eriksson",
    givenNames: "Anna Maria",
  }

  test("refuses a date of birth in the future, a misread", () => {
    expect(fieldsToTd1Mrz(fields)).toHaveLength(90)
    const nextYear = new Date().getUTCFullYear() + 1
    expect(() => fieldsToTd1Mrz({ ...fields, dateOfBirth: `${nextYear}-01-01` })).toThrow(
      "in the future",
    )
  })
})
