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

  it("reads the name from the id-card (TD1) offsets when the MRZ is 90 chars", () => {
    // TD1: 3 lines of 30 chars; the name lives in the third line (bytes 60-90). Only `mrz` is read.
    const idCardMRZ = "I".padEnd(60, "<") + "SMITH<<JOHN<MILLER".padEnd(30, "<")
    const idCard = { mrz: idCardMRZ } as PassportViewModel
    expect(getMrzDisclosedNames(idCard, { fullname: { disclose: true } }).fullName).toBe(
      "JOHN MILLER SMITH",
    )
    expect(getMrzDisclosedNames(idCard, { lastname: { disclose: true } }).lastName).toBe("SMITH")
  })
})
