// The sanctions tree: the leaves a sanctioned person produces, checked against the verifier's own
// encoding, and the tree over them.
import { describe, expect, test } from "bun:test"
import { AsyncOrderedMT, poseidon2, stringToAsciiStringArray } from "@zkpassport/utils"
import { buildSanctionsLeaves, buildSanctionsTree } from "./tree-builder"
import type { SanctionsPerson } from "./types"

function person(overrides: Partial<SanctionsPerson>): SanctionsPerson {
  return {
    id: "p",
    name: "JOHN DOE",
    firstNames: ["JOHN"],
    middleNames: [],
    secondNames: [],
    lastNames: ["DOE"],
    aliases: [],
    birthDate: null,
    passports: [],
    nationalities: [],
    countries: [],
    status: ["sanctioned"],
    datasets: ["us_ofac_sdn"],
    ...overrides,
  }
}

/** Poseidon2 over the MRZ bytes of the concatenated fields, as the verifier computes it */
const leafOf = (...fields: string[]) => poseidon2(stringToAsciiStringArray(fields.join("")))
const nameField = (primary: string, secondary: string) => `${primary}<<${secondary}`.padEnd(39, "<")

describe("name leaves", () => {
  test("one name leaf per given-name × family-name combination, over the 39-character field", async () => {
    const { leaves, counts } = await buildSanctionsLeaves([
      person({ firstNames: ["A", "B"], lastNames: ["X", "Y"] }),
    ])
    expect(counts).toEqual({ name: 4, nameAndDob: 0, nameAndYob: 0, passportAndCountry: 0 })
    for (const [last, first] of [
      ["X", "A"],
      ["Y", "A"],
      ["X", "B"],
      ["Y", "B"],
    ]) {
      expect(leaves).toContain(await leafOf(nameField(last, first)))
    }
  })

  test("a full birth date adds the name‖YYMMDD and name‖YY leaves", async () => {
    const { leaves, counts } = await buildSanctionsLeaves([person({ birthDate: "1975-03-07" })])
    expect(counts).toEqual({ name: 1, nameAndDob: 1, nameAndYob: 1, passportAndCountry: 0 })
    expect(leaves).toContain(await leafOf(nameField("DOE", "JOHN"), "750307"))
    expect(leaves).toContain(await leafOf(nameField("DOE", "JOHN"), "75"))
  })

  test("a year-only or year-month birth date adds only the name‖YY leaf", async () => {
    for (const birthDate of ["1975", "1975-03"]) {
      const { leaves, counts } = await buildSanctionsLeaves([person({ birthDate })])
      expect(counts).toEqual({ name: 1, nameAndDob: 0, nameAndYob: 1, passportAndCountry: 0 })
      expect(leaves).toContain(await leafOf(nameField("DOE", "JOHN"), "75"))
    }
  })

  test("no birth date gives the name leaf alone", async () => {
    const { leaves, counts } = await buildSanctionsLeaves([person({})])
    expect(counts).toEqual({ name: 1, nameAndDob: 0, nameAndYob: 0, passportAndCountry: 0 })
    expect(leaves).toEqual([await leafOf(nameField("DOE", "JOHN"))])
  })
})

describe("document leaf", () => {
  test("Poseidon2 over the 9-character document number field and the alpha-3 nationality", async () => {
    const { leaves } = await buildSanctionsLeaves([
      person({ passports: ["AB123"], nationalities: ["RU"] }),
    ])
    expect(leaves).toContain(await leafOf("AB123<<<<", "RUS"))
  })

  test("nationality is the first nationality, else the first associated country; alpha-2 accepted", async () => {
    const byNationality = await buildSanctionsLeaves([
      person({ passports: ["1"], nationalities: ["by", "RU"] }),
    ])
    expect(byNationality.leaves).toContain(await leafOf("1<<<<<<<<", "BLR"))
    const byCountry = await buildSanctionsLeaves([
      person({ passports: ["1"], countries: ["DE", "RU"] }),
    ])
    expect(byCountry.leaves).toContain(await leafOf("1<<<<<<<<", "DEU"))
  })

  test("no document leaf without a passport number or without a resolvable country", async () => {
    for (const p of [
      person({ nationalities: ["RU"] }),
      person({ passports: ["1"] }),
      person({ passports: ["1"], nationalities: ["XX"] }),
    ]) {
      expect((await buildSanctionsLeaves([p])).counts.passportAndCountry).toBe(0)
    }
  })

  test("only the first passport number contributes", async () => {
    const { leaves, counts } = await buildSanctionsLeaves([
      person({ passports: ["A1", "B2"], nationalities: ["RU"] }),
    ])
    expect(counts.passportAndCountry).toBe(1)
    expect(leaves).toContain(await leafOf("A1<<<<<<<", "RUS"))
  })
})

describe("all leaves", () => {
  test("four families, deduplicated within each family", async () => {
    const persons = [
      person({ id: "a", birthDate: "1975-03-07", passports: ["AB123"], nationalities: ["RU"] }),
      // same name, year only, no passport: shares the name and name+yob leaves with "a"
      person({ id: "b", birthDate: "1975" }),
      person({ id: "c", firstNames: ["MARY-ANN"], lastNames: ["ONEIL"] }),
    ]
    const { leaves, counts, mrzCount } = await buildSanctionsLeaves(persons)
    expect(mrzCount).toBe(3)
    expect(counts).toEqual({ name: 2, nameAndDob: 1, nameAndYob: 1, passportAndCountry: 1 })
    expect(leaves.length).toBe(5)
    expect(new Set(leaves).size).toBe(5)
    // hyphens inside a name part become fillers
    expect(leaves).toContain(await leafOf(nameField("ONEIL", "MARY<ANN")))
  })
})

describe("sanctions tree", () => {
  test("sorts and dedupes the leaves and matches a reference AsyncOrderedMT", async () => {
    const tree = await buildSanctionsTree([50n, 10n, 30n, 10n, 20n], 6)
    expect(tree.leaves).toEqual([10n, 20n, 30n, 50n])

    const reference = await AsyncOrderedMT.create(6, poseidon2)
    await reference.initialize([10n, 20n, 30n, 50n])
    expect(tree.root).toBe(reference.root)
  })

  test("builds at the requested depth", async () => {
    const tree = await buildSanctionsTree([1n, 2n], 5)
    expect(tree.serialize().length).toBe(6)
  })
})
