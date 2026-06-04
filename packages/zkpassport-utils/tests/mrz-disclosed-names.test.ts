import { getMrzDisclosedNames } from "../src/circuit-matcher"
import type { PassportViewModel, Query } from "../src/types"
import { PASSPORTS } from "./fixtures/passports"

// John Miller Smith's MRZ encodes the surname before "<<" and the given names after it:
//   P<ZKRSMITH<<JOHN<MILLER<<<...
// so the MRZ truth is: surname "SMITH", given names "JOHN MILLER".
// The fixture's DG11-style fields are deliberately different (firstName "John" / lastName "Smith"
// / fullName "John Miller Smith"); the helper must read only the MRZ, so its output is the
// uppercase MRZ form — which is what makes these assertions also prove DG11 is not consulted.
describe("getMrzDisclosedNames", () => {
  it("fullname is all given names plus the surname", () => {
    const result = getMrzDisclosedNames(PASSPORTS.john, { fullname: { disclose: true } })
    expect(result.fullName).toBe("JOHN MILLER SMITH")
  })

  it("lastname is the surname only (the field Caleb's DG11 polluted with the full name)", () => {
    const result = getMrzDisclosedNames(PASSPORTS.john, { lastname: { disclose: true } })
    expect(result.lastName).toBe("SMITH")
  })

  it("firstname is the first given name only (accepted under-disclosure of the firstname mask)", () => {
    const result = getMrzDisclosedNames(PASSPORTS.john, { firstname: { disclose: true } })
    expect(result.firstName).toBe("JOHN")
  })

  it("widens firstname to all given names when fullname is co-disclosed", () => {
    // Disclosing fullname reveals the whole name field, so firstname picks up every given name.
    // The verifier derives both from the same widened mask, so they still agree.
    const query: Query = { firstname: { disclose: true }, fullname: { disclose: true } }
    const result = getMrzDisclosedNames(PASSPORTS.john, query)
    expect(result.firstName).toBe("JOHN MILLER")
    expect(result.fullName).toBe("JOHN MILLER SMITH")
  })

  // ID cards / residence permits use the TD1 layout (3x30 chars, 90 total) with the name on the
  // third line (bytes 60-90), vs a passport's TD3 layout (88 chars, name at 5-44). These are real
  // ICAO specimen MRZs — the same ones the mobile app tests with — so the id-card path is covered
  // on representative data, not a hand-built string.
  describe("id cards (TD1, 90-char MRZ)", () => {
    const disclose = { disclose: true }
    const idCard = (mrz: string) => ({ mrz }) as PassportViewModel

    it("parses a standard ID card from the TD1 name line", () => {
      // Jane Doe, ZKR ID card
      const jane = idCard(
        "I<ZKRZID222222<<<<<<<<<<<<<<<<9801157F3001018ZKR<<<<<<<<<<<2DOE<<JANE<<<<<<<<<<<<<<<<<<<<<",
      )
      expect(getMrzDisclosedNames(jane, { fullname: disclose }).fullName).toBe("JANE DOE")
      expect(getMrzDisclosedNames(jane, { lastname: disclose }).lastName).toBe("DOE")
      expect(getMrzDisclosedNames(jane, { firstname: disclose }).firstName).toBe("JANE")
    })

    it("handles a multi-word surname (single-chevron separators) and MRZ truncation", () => {
      // Portuguese specimen: surname "CACADOR DE ARAUJO", given names truncated at 30 chars ("ESTEV")
      const pt = idCard(
        "I<PRT007666667<ZZ00<<<<<<<<<<<8303143M3405293PRT<<<<<<<<<<<4CACADOR<DE<ARAUJO<<ANDRE<ESTEV",
      )
      expect(getMrzDisclosedNames(pt, { lastname: disclose }).lastName).toBe("CACADOR DE ARAUJO")
      expect(getMrzDisclosedNames(pt, { fullname: disclose }).fullName).toBe(
        "ANDRE ESTEV CACADOR DE ARAUJO",
      )
    })

    it("treats a non-'I' prefixed national ID as TD1 via the 90-char length rule", () => {
      // Norwegian specimen — document type starts with "C", still TD1; the length-based id-card
      // check must catch it (a prefix-only check on "I" would miss it).
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
