/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "bun:test"
import { nodeToHex } from "../merkle-tree"
import type { PackagedSanctionsFile, SanctionsSource } from "../types"
import {
  buildSanctionsTree,
  calculatePackagedSanctionsRoot,
  checkPackagedSanctionsFileShape,
  createPackagedSanctionsFile,
  type CreatePackagedSanctionsFileInput,
} from "./sanctions"

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
  attribution: "Derived from OpenSanctions (https://www.opensanctions.org), licensed CC BY-NC 4.0",
}

/** A copy of a well-formed file with one change applied */
function variant(base: PackagedSanctionsFile, mutate: (file: any) => void): unknown {
  const file = JSON.parse(JSON.stringify(base))
  mutate(file)
  return file
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

describe("createPackagedSanctionsFile", () => {
  it("lists the tree's leaves and its root", async () => {
    const { file, tree } = await createPackagedSanctionsFile(input)

    expect(file.leaves).toEqual([hex32(3), hex32(5), hex32(9)])
    expect(file.root).toBe(nodeToHex(tree.root))
    expect(await calculatePackagedSanctionsRoot(file)).toBe(file.root)
  })

  it("records the provenance, sorted by dataset, the builder and the attribution", async () => {
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

  it("leaves environment and previous_root out when there are none", async () => {
    const { file } = await createPackagedSanctionsFile({
      ...input,
      environment: undefined,
      previous_root: undefined,
    })

    expect("environment" in file).toBe(false)
    expect("previous_root" in file).toBe(false)
  })

  it("refuses an empty tree and a sentinel value as a leaf", async () => {
    await expect(createPackagedSanctionsFile({ ...input, leaves: [] })).rejects.toThrow(
      /at least one leaf/,
    )
    await expect(createPackagedSanctionsFile({ ...input, leaves: [0n, 1n] })).rejects.toThrow(
      /reserved as a sentinel/,
    )
  })

  it("produces a file the shape check accepts", async () => {
    const { file } = await createPackagedSanctionsFile(input)
    expect(checkPackagedSanctionsFileShape(file)).toEqual([])
  })
})

describe("checkPackagedSanctionsFileShape", () => {
  it("names every problem it finds", async () => {
    const { file } = await createPackagedSanctionsFile(input)

    expect(checkPackagedSanctionsFileShape(null)).toEqual(["not an object"])
    expect(
      checkPackagedSanctionsFileShape(
        variant(file, (f) => {
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
    expect(checkPackagedSanctionsFileShape(variant(file, (f) => (f.leaves = [])))).toEqual([
      "leaves must be a non-empty array",
    ])
    expect(
      checkPackagedSanctionsFileShape(variant(file, (f) => (f.leaves = [hex32(0), hex32(1)]))),
    ).toEqual(["leaves must be sorted ascending, unique and non-zero"])
    expect(
      checkPackagedSanctionsFileShape(variant(file, (f) => (f.sources[1].dataset = "eu_fsf"))),
    ).toEqual(["duplicate dataset eu_fsf"])
  })
})
