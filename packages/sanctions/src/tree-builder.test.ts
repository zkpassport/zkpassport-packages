// The sanctions tree: the leaves a sanctioned person produces, checked against the verifier's own
// encoding, and the packaged sanctions file that records the tree over them.
import { describe, expect, test } from "bun:test"
import {
  calculatePackagedSanctionsRoot,
  checkPackagedSanctionsFileShape,
  nodeToHex,
  poseidon2,
  stringToAsciiStringArray,
  type SanctionsSource,
} from "@zkpassport/utils"
import {
  buildSanctionsLeaves,
  createPackagedSanctionsFile,
  type CreatePackagedSanctionsFileInput,
} from "./tree-builder"
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

  test("a country value that is not a 2- or 3-letter code is passed over for the next one", async () => {
    // ISO 3166-3 code of the Soviet Union, as OpenSanctions emits for people born there
    const { leaves, counts } = await buildSanctionsLeaves([
      person({ passports: ["1"], nationalities: ["SUHH", "RU"], countries: ["RU", "SUHH"] }),
    ])
    expect(counts.passportAndCountry).toBe(1)
    expect(leaves).toContain(await leafOf("1<<<<<<<<", "RUS"))
  })

  test("no document leaf without a passport number or without a resolvable country", async () => {
    for (const p of [
      person({ nationalities: ["RU"] }),
      person({ passports: ["1"] }),
      person({ passports: ["1"], nationalities: ["XX"] }),
      person({ passports: ["1"], nationalities: ["SUHH"], countries: ["SUHH"] }),
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

  test("the name-variant records of one entity repeat its name parts; each combination is hashed once", async () => {
    // extractPersons emits one record per full-name variant, all carrying the entity's whole
    // firstNames and lastNames, so the combinations below occur three times over
    const shared = { id: "e", firstNames: ["A", "B"], lastNames: ["X"], birthDate: "1975-03-07" }
    const persons = [
      person({ ...shared, name: "A X" }),
      person({ ...shared, name: "B X" }),
      person({ ...shared, name: "A B X" }),
    ]
    const { leaves, counts, mrzCount } = await buildSanctionsLeaves(persons)
    expect(mrzCount).toBe(6)
    expect(counts).toEqual({ name: 2, nameAndDob: 2, nameAndYob: 2, passportAndCountry: 0 })
    expect(new Set(leaves).size).toBe(6)
  })
})

describe("packaged sanctions file", () => {
  const hex32 = (n: bigint | number) => nodeToHex(BigInt(n))
  const sources: SanctionsSource[] = [
    {
      dataset: "us_ofac_sdn",
      url: "https://data.opensanctions.org/artifacts/us_ofac_sdn/20260918081735-mcz/entities.ftm.json",
      build: "20260918081735-mcz",
      sha256: hex32(0xabc),
      size: 53_017_458,
      entities: 11_842,
    },
    {
      dataset: "eu_fsf",
      url: "https://data.opensanctions.org/artifacts/eu_fsf/20260918100001-abc/entities.ftm.json",
      build: "20260918100001-abc",
      sha256: hex32(0xdef),
      size: 15_000_000,
      entities: 4_000,
    },
  ]
  const input: CreatePackagedSanctionsFileInput = {
    timestamp: 1_758_186_000,
    environment: "test",
    previous_root: "0xABC",
    leaves: [9n, 3n, 5n, 3n],
    tree_depth: 4,
    sources,
    sanctions_version: "0.1.0",
    utils_version: "0.39.0-beta.2",
    attribution:
      "Derived from OpenSanctions (https://www.opensanctions.org), licensed CC BY-NC 4.0",
  }

  test("lists the tree's sorted, deduplicated leaves and its root", async () => {
    const { file, tree } = await createPackagedSanctionsFile(input)

    expect(file.leaves).toEqual([hex32(3), hex32(5), hex32(9)])
    expect(file.root).toBe(nodeToHex(tree.root))
    expect(await calculatePackagedSanctionsRoot(file)).toBe(file.root)
  })

  test("records the provenance, sorted by dataset, the builder and the attribution", async () => {
    const { file } = await createPackagedSanctionsFile(input)

    expect(file).toMatchObject({
      version: 1,
      timestamp: input.timestamp,
      environment: "test",
      previous_root: hex32(0xabc),
      builder: { sanctions_version: "0.1.0", utils_version: "0.39.0-beta.2", tree_depth: 4 },
      attribution: input.attribution,
    })
    expect(file.sources.map((s) => s.dataset)).toEqual(["eu_fsf", "us_ofac_sdn"])
  })

  test("leaves environment and previous_root out when there are none", async () => {
    const { file } = await createPackagedSanctionsFile({
      ...input,
      environment: undefined,
      previous_root: undefined,
    })

    expect("environment" in file).toBe(false)
    expect("previous_root" in file).toBe(false)
  })

  test("refuses an empty tree and a sentinel value as a leaf", async () => {
    await expect(createPackagedSanctionsFile({ ...input, leaves: [] })).rejects.toThrow(
      /at least one leaf/,
    )
    await expect(createPackagedSanctionsFile({ ...input, leaves: [0n, 1n] })).rejects.toThrow(
      /reserved as a sentinel/,
    )
  })

  test("produces a file the shape check accepts", async () => {
    const { file } = await createPackagedSanctionsFile(input)
    expect(checkPackagedSanctionsFileShape(file)).toEqual([])
  })
})
