/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "bun:test"
import { nodeToHex } from "../merkle-tree"
import type { PackagedSanctionsFile } from "../types"
import {
  buildSanctionsTree,
  calculatePackagedSanctionsRoot,
  checkPackagedSanctionsFileShape,
} from "./sanctions"

const hex32 = (n: bigint | number) => nodeToHex(BigInt(n))

/** A well-formed file, as @zkpassport/sanctions' createPackagedSanctionsFile writes it */
const file: PackagedSanctionsFile = {
  version: 1,
  timestamp: 1_758_186_000,
  environment: "test",
  previous_root: hex32(0xabc),
  root: hex32(0x1234),
  leaves: [hex32(3), hex32(5), hex32(9)],
  sources: [
    {
      dataset: "eu_fsf",
      url: "https://data.opensanctions.org/artifacts/eu_fsf/20260918100001-abc/entities.ftm.json",
      build: "20260918100001-abc",
      sha256: hex32(0xdef),
      size: 15_000_000,
      entities: 4_000,
    },
    {
      dataset: "us_ofac_sdn",
      url: "https://data.opensanctions.org/artifacts/us_ofac_sdn/20260918081735-mcz/entities.ftm.json",
      build: "20260918081735-mcz",
      sha256: hex32(0xabc),
      size: 53_017_458,
      entities: 11_842,
    },
  ],
  builder: { sanctions_version: "0.1.0", utils_version: "0.39.0-beta.2", tree_depth: 4 },
  attribution: "Derived from OpenSanctions (https://www.opensanctions.org), licensed CC BY-NC 4.0",
}

/** A copy of the well-formed file with one change applied */
function variant(mutate: (file: any) => void): unknown {
  const copy = JSON.parse(JSON.stringify(file))
  mutate(copy)
  return copy
}

describe("buildSanctionsTree", () => {
  it("sorts and deduplicates the leaves and brackets them with the sentinels", async () => {
    const tree = await buildSanctionsTree([9n, 3n, 5n, 3n], 4)

    expect(tree.leaves).toEqual([3n, 5n, 9n])
    const layer0 = tree.serialize()[0]
    expect(layer0[0]).toBe(hex32(0))
    expect(layer0.slice(1, 4)).toEqual([hex32(3), hex32(5), hex32(9)])
  })
})

describe("calculatePackagedSanctionsRoot", () => {
  it("is the root of the tree built from the file's leaves at the file's depth", async () => {
    const tree = await buildSanctionsTree([3n, 5n, 9n], 4)
    expect(await calculatePackagedSanctionsRoot(file)).toBe(nodeToHex(tree.root))
  })
})

describe("checkPackagedSanctionsFileShape", () => {
  it("accepts a well-formed file", () => {
    expect(checkPackagedSanctionsFileShape(file)).toEqual([])
  })

  it("names every problem it finds", () => {
    expect(checkPackagedSanctionsFileShape(null)).toEqual(["not an object"])
    expect(
      checkPackagedSanctionsFileShape(
        variant((f) => {
          f.version = 2
          f.timestamp = -1
          f.leaves = [hex32(5), hex32(3)]
          f.sources[0].url = "http://example.com"
          f.sources[1].build = ""
          f.builder.tree_depth = 0
          delete f.attribution
        }),
      ),
    ).toEqual([
      "unsupported version 2",
      "timestamp must be a positive integer",
      "leaves must be sorted ascending, unique and non-zero",
      "source eu_fsf: url must be https",
      "source us_ofac_sdn: build missing",
      "builder.tree_depth must be a positive integer",
      "attribution missing",
    ])
    expect(checkPackagedSanctionsFileShape(variant((f) => (f.leaves = [])))).toEqual([
      "leaves must be a non-empty array",
    ])
    expect(
      checkPackagedSanctionsFileShape(variant((f) => (f.leaves = [hex32(0), hex32(1)]))),
    ).toEqual(["leaves must be sorted ascending, unique and non-zero"])
    expect(
      checkPackagedSanctionsFileShape(variant((f) => (f.sources[1].dataset = "eu_fsf"))),
    ).toEqual(["duplicate dataset eu_fsf"])
  })
})
