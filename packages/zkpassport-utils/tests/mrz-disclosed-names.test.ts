import { getMrzDisclosedNames } from "../src/circuit-matcher"
import type { PassportViewModel, Query } from "../src/types"
import { PASSPORTS } from "./fixtures/passports"

// PASSPORTS.john MRZ encodes surname "SMITH" and given names "JOHN MILLER"; its DG11 fields differ.
describe("getMrzDisclosedNames", () => {
  it("fullname is all given names plus the surname", () => {
    expect(getMrzDisclosedNames(PASSPORTS.john, { fullname: { disclose: true } }).fullName).toBe(
      "JOHN MILLER SMITH",
    )
  })

  it("lastname is the surname only", () => {
    expect(getMrzDisclosedNames(PASSPORTS.john, { lastname: { disclose: true } }).lastName).toBe(
      "SMITH",
    )
  })

  it("firstname is the first given name only", () => {
    expect(getMrzDisclosedNames(PASSPORTS.john, { firstname: { disclose: true } }).firstName).toBe(
      "JOHN",
    )
  })

  it("firstname + lastname discloses the first given name and the surname, not the middle name", () => {
    const query: Query = { firstname: { disclose: true }, lastname: { disclose: true } }
    const result = getMrzDisclosedNames(PASSPORTS.john, query)
    expect(result.firstName).toBe("JOHN")
    expect(result.lastName).toBe("SMITH")
  })

  it("firstname widens to all given names when fullname is also disclosed", () => {
    const query: Query = { firstname: { disclose: true }, fullname: { disclose: true } }
    const result = getMrzDisclosedNames(PASSPORTS.john, query)
    expect(result.firstName).toBe("JOHN MILLER")
    expect(result.fullName).toBe("JOHN MILLER SMITH")
  })

  // Real ICAO TD1 specimens (90-char MRZ, name on the third line), matching the mobile app fixtures.
  describe("id cards (TD1)", () => {
    const disclose = { disclose: true }
    const idCard = (mrz: string) => ({ mrz }) as PassportViewModel

    it("reads the name from a standard ID card", () => {
      const jane = idCard(
        "I<ZKRZID222222<<<<<<<<<<<<<<<<9801157F3001018ZKR<<<<<<<<<<<2DOE<<JANE<<<<<<<<<<<<<<<<<<<<<",
      )
      expect(getMrzDisclosedNames(jane, { fullname: disclose }).fullName).toBe("JANE DOE")
      expect(getMrzDisclosedNames(jane, { lastname: disclose }).lastName).toBe("DOE")
      expect(getMrzDisclosedNames(jane, { firstname: disclose }).firstName).toBe("JANE")
    })

    it("handles a multi-word surname and a truncated given-name field", () => {
      const pt = idCard(
        "I<PRT007666667<ZZ00<<<<<<<<<<<8303143M3405293PRT<<<<<<<<<<<4CACADOR<DE<ARAUJO<<ANDRE<ESTEV",
      )
      expect(getMrzDisclosedNames(pt, { lastname: disclose }).lastName).toBe("CACADOR DE ARAUJO")
      expect(getMrzDisclosedNames(pt, { fullname: disclose }).fullName).toBe(
        "ANDRE ESTEV CACADOR DE ARAUJO",
      )
    })

    it("treats a non-'I' document type as an ID card by its 90-char length", () => {
      const no = idCard(
        "CANORGDC0001273230456<12345<<<5604230M2606118NOR<<<<<<<<<<<9OESTENBYEN<<AASAMUND<SPECIMEN<",
      )
      expect(getMrzDisclosedNames(no, { lastname: disclose }).lastName).toBe("OESTENBYEN")
      expect(getMrzDisclosedNames(no, { fullname: disclose }).fullName).toBe(
        "AASAMUND SPECIMEN OESTENBYEN",
      )
    })
  })
})
