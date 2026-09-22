/**
 * The packaged sanctions file: the JSON document published with each root of the Sanctions
 * Registry. It lists every leaf of the sanctions tree, which upstream snapshots the leaves came
 * from and which code produced them. The registry stores the file's IPFS CIDv0 next to the root
 * (historicalRoots[root].cid), so holding the file is enough to rebuild the tree and check the
 * root, as calculatePackagedCertificatesRoot does for the Certificate Registry's file.
 *
 * The sanctions publisher (zkpassport-publishing) creates these files; a client that downloads
 * one validates it with checkPackagedSanctionsFileShape and calculatePackagedSanctionsRoot.
 */
import { AsyncOrderedMT, nodeToHex, poseidon2 } from "../merkle-tree"
import type { PackagedSanctionsFile, PackagedSanctionsFileV1, SanctionsSource } from "../types"

/**
 * Build the sanctions tree from the leaves of all four leaf families (in any order, repeats
 * allowed). The depth must be the one the sanctions circuit is compiled for
 * (`SANCTIONS_ORDERED_MERKLE_TREE_LEAF_DEPTH` in the circuits repo), which the Sanctions Registry
 * also records as its tree height. AsyncOrderedMT sorts and deduplicates the leaves and adds its
 * two sentinel leaves, 0 and its fixed upper bound, around them.
 */
export async function buildSanctionsTree(leaves: bigint[], depth: number): Promise<AsyncOrderedMT> {
  const tree = await AsyncOrderedMT.create(depth, poseidon2)
  await tree.initializeAndSort(leaves)
  return tree
}

/**
 * Input for {@link createPackagedSanctionsFile}.
 */
export type CreatePackagedSanctionsFileInput = {
  /** Unix seconds at which the package is built; also published with the root */
  timestamp: number
  /** Environment label, e.g. "test"; omit for production */
  environment?: string
  /** The root this one supersedes, if any */
  previous_root?: string
  /** Leaf hashes from all sources and all leaf families, in any order, duplicates allowed */
  leaves: bigint[]
  /** Depth of the sanctions tree; the Sanctions Registry records it as its tree height */
  tree_depth: number
  /** One record per upstream snapshot the leaves were derived from */
  sources: SanctionsSource[]
  /** Version of @zkpassport/sanctions, which parsed the snapshots and hashed the leaves */
  sanctions_version: string
  /** Version of @zkpassport/utils, which provides poseidon2 and AsyncOrderedMT */
  utils_version: string
  /** Licence attribution of the upstream data, e.g. OpenSanctions' CC BY-NC 4.0 notice */
  attribution: string
}

/**
 * Build the sanctions tree from the leaves and assemble a {@link PackagedSanctionsFileV1} around
 * its root. The tree is returned as well, so a publisher can serialise it without building it
 * twice.
 */
export async function createPackagedSanctionsFile(
  input: CreatePackagedSanctionsFileInput,
): Promise<{ file: PackagedSanctionsFileV1; tree: AsyncOrderedMT }> {
  if (input.leaves.length === 0) {
    throw new Error("A packaged sanctions file needs at least one leaf")
  }
  const tree = await buildSanctionsTree(input.leaves, input.tree_depth)

  const file: PackagedSanctionsFileV1 = {
    version: 1,
    timestamp: input.timestamp,
    ...(input.environment !== undefined && { environment: input.environment }),
    root: nodeToHex(tree.root),
    ...(input.previous_root !== undefined && {
      previous_root: nodeToHex(BigInt(input.previous_root)),
    }),
    leaves: tree.leaves.map(nodeToHex),
    sources: [...input.sources].sort((a, b) => a.dataset.localeCompare(b.dataset)),
    builder: {
      sanctions_version: input.sanctions_version,
      utils_version: input.utils_version,
      tree_depth: input.tree_depth,
    },
    attribution: input.attribution,
  }
  return { file, tree }
}

/**
 * Rebuild the sanctions tree from a file's leaves at the depth the file records and return its
 * root, to compare with `file.root` or with the root the registry published.
 */
export async function calculatePackagedSanctionsRoot(file: PackagedSanctionsFile): Promise<string> {
  const tree = await buildSanctionsTree(file.leaves.map(BigInt), file.builder.tree_depth)
  return nodeToHex(tree.root)
}

const HEX32 = /^0x[0-9a-f]{64}$/
const isHex32 = (value: unknown): value is string => typeof value === "string" && HEX32.test(value)
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0
const isInteger = (value: unknown, min: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : undefined

/**
 * Structural checks of a parsed file, without hashing: field types, hex formats, leaves sorted,
 * unique and non-zero, one record per source. Returns the problems found; an empty array means
 * the file is well-formed. What a source record must say about its upstream (which dataset names
 * exist, what a build id looks like) is the publisher's to check.
 */
export function checkPackagedSanctionsFileShape(file: unknown): string[] {
  const f = asRecord(file)
  if (!f) return ["not an object"]
  const problems: string[] = []

  if (f.version !== 1) problems.push(`unsupported version ${f.version}`)
  if (!isInteger(f.timestamp, 1)) problems.push("timestamp must be a positive integer")
  if (!isHex32(f.root)) problems.push("root must be 0x + 64 lowercase hex")
  if (f.previous_root !== undefined && !isHex32(f.previous_root)) {
    problems.push("previous_root must be 0x + 64 lowercase hex")
  }

  if (!Array.isArray(f.leaves) || f.leaves.length === 0) {
    problems.push("leaves must be a non-empty array")
  } else if (!f.leaves.every(isHex32)) {
    problems.push("every leaf must be 0x + 64 lowercase hex")
  } else {
    let prev = 0n
    for (const hex of f.leaves) {
      const value = BigInt(hex)
      if (value <= prev) {
        problems.push("leaves must be sorted ascending, unique and non-zero")
        break
      }
      prev = value
    }
  }

  if (!Array.isArray(f.sources) || f.sources.length === 0) {
    problems.push("sources must be a non-empty array")
  } else {
    const seen = new Set<string>()
    for (const source of f.sources) {
      const s = asRecord(source)
      if (!s || !isNonEmptyString(s.dataset)) {
        problems.push("every source needs a dataset name")
        continue
      }
      const name = s.dataset
      if (seen.has(name)) problems.push(`duplicate dataset ${name}`)
      seen.add(name)
      if (typeof s.url !== "string" || !s.url.startsWith("https://")) {
        problems.push(`source ${name}: url must be https`)
      }
      if (!isNonEmptyString(s.build)) problems.push(`source ${name}: build missing`)
      if (!isHex32(s.sha256)) problems.push(`source ${name}: sha256 must be 0x + 64 lowercase hex`)
      if (!isInteger(s.size, 1)) problems.push(`source ${name}: size must be a positive integer`)
      if (!isInteger(s.entities, 0)) {
        problems.push(`source ${name}: entities must be a non-negative integer`)
      }
    }
  }

  const builder = asRecord(f.builder)
  if (!builder) {
    problems.push("builder missing")
  } else {
    if (typeof builder.sanctions_version !== "string") problems.push("builder.sanctions_version")
    if (typeof builder.utils_version !== "string") problems.push("builder.utils_version")
    if (!isInteger(builder.tree_depth, 1)) {
      problems.push("builder.tree_depth must be a positive integer")
    }
  }
  if (!isNonEmptyString(f.attribution)) problems.push("attribution missing")

  return problems
}
