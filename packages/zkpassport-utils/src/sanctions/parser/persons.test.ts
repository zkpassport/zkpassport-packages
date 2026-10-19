// FollowTheMoney Person entities → MRZ-ready person records.
// Schema reference: https://followthemoney.tech/explorer/schemata/Person/
import { describe, expect, test } from "bun:test"
import {
  countriesOf,
  extractAllPersons,
  extractPersons,
  nameVariants,
  normalizeBirthDate,
  statusOf,
} from "./persons"
import type { FtmEntity } from "../types"

function entity(properties: Record<string, string[]>, extra: Partial<FtmEntity> = {}): FtmEntity {
  return { id: "e1", schema: "Person", datasets: ["us_ofac_sdn"], properties, ...extra }
}

describe("schema filter", () => {
  test("only Person entities yield records", () => {
    for (const schema of ["Organization", "Vessel", "Address", "Passport", "Company"]) {
      const r = extractPersons(entity({ name: ["Example"] }, { schema }))
      expect(r.persons).toEqual([])
      expect(r.dropped).toEqual([])
    }
  })
})

describe("name variants", () => {
  test("uses the name values followed by every combination of the name parts, in source order", () => {
    const e = entity({
      name: ["Jane Q Example"],
      firstName: ["Jane", "Janet"],
      middleName: ["Q"],
      lastName: ["Example"],
    })
    expect(nameVariants(e)).toEqual(["Jane Q Example", "Janet Q Example"])
  })

  test("skips empty parts and duplicates", () => {
    const e = entity({ name: ["Jane Example"], firstName: ["Jane"], lastName: ["Example"] })
    expect(nameVariants(e)).toEqual(["Jane Example"])
    expect(nameVariants(entity({ firstName: ["Jane"] }))).toEqual(["Jane"])
    expect(nameVariants(entity({ lastName: ["Example"], secondName: ["Q"] }))).toEqual([
      "Q Example",
    ])
  })

  test("emits one record per representable variant, sharing the identity attributes", () => {
    const { persons } = extractPersons(
      entity({
        name: ["Jane Q Example"],
        firstName: ["Jane"],
        lastName: ["Example"],
        birthDate: ["1980-02-03"],
        passportNumber: ["X1234567"],
        nationality: ["ru"],
      }),
    )
    expect(persons.map((p) => p.name)).toEqual(["JANE Q EXAMPLE", "JANE EXAMPLE"])
    for (const p of persons) {
      expect(p).toMatchObject({
        id: "e1",
        firstNames: ["JANE"],
        lastNames: ["EXAMPLE"],
        birthDate: "1980-02-03",
        passports: ["X1234567"],
        nationalities: ["RU"],
      })
    }
  })

  test("transliterates and upper-cases every name and name part", () => {
    const { persons } = extractPersons(
      entity({ firstName: ["Jörg"], lastName: ["Müller", "O'Neil"] }),
    )
    expect(persons.map((p) => p.name).sort()).toEqual(["JOERG MUELLER", "JOERG ONEIL"])
    expect(persons[0].firstNames).toEqual(["JOERG"])
    expect(persons[0].lastNames).toEqual(["MUELLER", "ONEIL"])
  })

  test("name parts are sorted so output does not depend on source order", () => {
    const a = extractPersons(entity({ firstName: ["Ali"], lastName: ["Sample", "al-Sample"] }))
    const b = extractPersons(entity({ firstName: ["Ali"], lastName: ["al-Sample", "Sample"] }))
    expect(a.persons[0].lastNames).toEqual(["AL-SAMPLE", "SAMPLE"])
    expect(b.persons[0].lastNames).toEqual(a.persons[0].lastNames)
  })

  test("a variant that cannot be written in the MRZ alphabet is dropped and reported", () => {
    const r = extractPersons(
      entity({ name: ["李小龙", "Bruce Lee"], firstName: ["Bruce"], lastName: ["Lee", "李"] }),
    )
    expect(r.persons.map((p) => p.name)).toEqual(["BRUCE LEE"])
    expect(r.persons[0].lastNames).toEqual(["LEE"])
    expect(r.dropped).toEqual([
      { id: "e1", name: "李小龙", transliterated: "李小龙" },
      { id: "e1", name: "Bruce 李", transliterated: "BRUCE 李" },
      { id: "e1", name: "李", transliterated: "李" },
    ])
  })

  test("an entity with no representable name yields no records and is reported as uncovered", () => {
    const r = extractPersons(entity({ name: ["李小龙"] }))
    expect(r.persons).toEqual([])
    expect(r.dropped.length).toBe(1)
    expect(r.uncovered).toEqual(["e1"])
  })

  test("entities with a representable name, or with no names at all, are not uncovered", () => {
    expect(extractPersons(entity({ name: ["李小龙", "Bruce Lee"] })).uncovered).toEqual([])
    expect(extractPersons(entity({})).uncovered).toEqual([])
    expect(
      extractPersons(entity({ name: ["Example"] }, { schema: "Organization" })).uncovered,
    ).toEqual([])
  })

  test("Cyrillic-only and mixed-script names are transliterated, not dropped", () => {
    const { persons, dropped } = extractPersons(
      entity({
        name: ["Иван Примеров", "IVAN ПРИМЕРОВ"],
        firstName: ["Иван"],
        lastName: ["Примеров"],
      }),
    )
    expect(dropped).toEqual([])
    expect(persons.map((p) => p.name)).toEqual(["IVAN PRIMEROV"])
    expect(persons[0]).toMatchObject({ firstNames: ["IVAN"], lastNames: ["PRIMEROV"] })
  })
})

describe("birth date (FTM date type: YYYY, YYYY-MM, YYYY-MM-DD, optional time)", () => {
  test.each([
    ["1975", "1975"],
    ["1975-03", "1975-03"],
    ["1975-03-07", "1975-03-07"],
    ["1975-03-07T12:34:56", "1975-03-07"],
    ["1975-03-07T12", "1975-03-07"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeBirthDate(input)).toBe(expected)
  })

  test("values that are not FTM dates, and missing values, give null", () => {
    expect(normalizeBirthDate("circa 1975")).toBeNull()
    expect(normalizeBirthDate("07/03/1975")).toBeNull()
    expect(normalizeBirthDate(undefined)).toBeNull()
    expect(normalizeBirthDate("")).toBeNull()
  })

  test("the first of several birth dates is used", () => {
    const { persons } = extractPersons(entity({ name: ["A B"], birthDate: ["1975-03-07", "1976"] }))
    expect(persons[0].birthDate).toBe("1975-03-07")
  })
})

describe("countries, nationalities and aliases", () => {
  test("nationalities keep source order and are upper-cased", () => {
    const { persons } = extractPersons(entity({ name: ["A B"], nationality: ["ru", "by"] }))
    expect(persons[0].nationalities).toEqual(["RU", "BY"])
  })

  test("countries are the sorted union of country, nationality, birthPlace codes and address country suffixes", () => {
    const e = entity({
      name: ["A B"],
      country: ["sy", "ir"],
      nationality: ["ir"],
      birthPlace: ["Damascus", "SY", "kp"],
      address: ["1 Test Street, Minsk, BY", "Somewhere, Not a code"],
    })
    expect(countriesOf(e)).toEqual(["BY", "IR", "KP", "SY"])
  })

  test("aliases are alias and weakAlias values that are not names, deduplicated and sorted", () => {
    const { persons } = extractPersons(
      entity({
        name: ["Ali Sample"],
        alias: ["Sample Ali", "Ali Sample", "A. Sample"],
        weakAlias: ["Sam", "Sample Ali"],
      }),
    )
    expect(persons[0].aliases).toEqual(["A. Sample", "Sam", "Sample Ali"])
  })
})

describe("status", () => {
  test("maps topics to status tags", () => {
    expect(
      statusOf(entity({ topics: ["sanction", "wanted", "crime", "pep", "poi", "debarment"] })),
    ).toEqual(["sanctioned", "debarred", "wanted", "crime-related", "pep", "person-of-interest"])
    expect(statusOf(entity({}))).toEqual([])
  })

  test("adds dataset-derived tags without duplicating topic-derived ones", () => {
    expect(
      statusOf(entity({ topics: ["sanction"] }, { datasets: ["interpol_red_notices"] })),
    ).toEqual(["sanctioned", "interpol-notice"])
    expect(
      statusOf(entity({ topics: ["wanted"] }, { datasets: ["interpol_red_notices"] })),
    ).toEqual(["wanted"])
    expect(statusOf(entity({ topics: ["pep"] }, { datasets: ["eu_pep_list"] }))).toEqual(["pep"])
    expect(statusOf(entity({}, { datasets: ["gb_disqualified_directors"] }))).toEqual([
      "disqualified",
    ])
  })
})

describe("whole datasets", () => {
  test("extractAllPersons flattens records and dropped names across entities", () => {
    const r = extractAllPersons([
      entity({ name: ["Jane Doe"] }, { id: "a" }),
      entity({ name: ["Example Corp"] }, { id: "o", schema: "Organization" }),
      entity({ name: ["李小龙"] }, { id: "c" }),
      entity({ name: ["John Roe"] }, { id: "b" }),
    ])
    expect(r.persons.map((p) => p.id)).toEqual(["a", "b"])
    expect(r.dropped.map((d) => d.id)).toEqual(["c"])
    expect(r.uncovered).toEqual(["c"])
  })

  test("output is a pure function of the input", () => {
    const es = [entity({ name: ["Jane Doe"], country: ["by", "ru"], alias: ["JD", "Jane"] })]
    expect(extractAllPersons(es)).toEqual(extractAllPersons(es))
  })
})
