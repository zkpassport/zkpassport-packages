export type Node = bigint

export type AsyncHashFunction = (childNodes: Node[]) => Promise<Node>

export type MembershipProof = {
  root: Node
  leaf: Node
  leafIndex: number
  siblings: Node[]
}

export type NeighborMembershipProof = {
  leaf: Node
  proof: MembershipProof
}

export type SortedNonMembershipProof = {
  root: Node
  target: Node
  left?: NeighborMembershipProof
  right?: NeighborMembershipProof
}

const ZERO_NODE: Node = 0n
export const BN254_MODULUS_MINUS_ONE: Node = BigInt(0x2523648240000001BA344D80000000086121000000000013A700000000000012);

/**
 * Sorted Merkle Set for membership and non-membership proofs.
 * - Leaves are unique and sorted ascending
 * - Membership proof: standard binary Merkle path
 * - Non-membership proof: neighbor membership proofs + ordering (left < target < right)
 *   - every tree by default includes 0 and BN254.MODULUS as leaves, to avoid cases where non membership proofs can be 
 *     created for the first or last item in the tree.
 */
export default class AsyncOrderedMT {
  private readonly depth: number
  private readonly hash: AsyncHashFunction

  private zeroes: Node[] = [] // per-level zero values
  private layers: Node[][] = [] // layers[0] = leaves (padded), ... layers[depth][0] = root
  private leaves: Node[] = [] // sorted unique input leaves (un-padded)

  private constructor(depth: number, hash: AsyncHashFunction) {
    this.depth = depth
    this.hash = hash
  }

  public static async create(depth: number, hash: AsyncHashFunction): Promise<AsyncOrderedMT> {
    return new AsyncOrderedMT(depth, hash)
  }

  public get root(): Node {
    if (this.layers[this.depth] && this.layers[this.depth][0] !== undefined) {
      return this.layers[this.depth][0]
    }
    // Default root equals zero hash iterated depth times
    return this.zeroes[this.depth - 1] ?? ZERO_NODE // ZERO_NODE if the tree is empty
  }

  /**
   * Initialize and sort the leaves
   * @param leafHashes 
   */
  public async initializeAndSort(leafHashes: Node[]) {
    const uniqueSorted = Array.from(new Set(leafHashes.map((v) => BigInt(v)))).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    await this.initialize(uniqueSorted)
  }

  /**
   * Initialize from leaf hashes. Assumes leaves are already sorted and unique.
   */
  public async initialize(leafHashes: Node[]) {
    const cap = 1 << this.depth
    if (leafHashes.length > cap) {
      throw new Error(`Too many leaves for depth ${this.depth}: ${leafHashes.length} > ${cap}`)
    }

    // To get around the edge case where we need to provide a non membership proof for the first item in the tree
    // or the last item in the tree, we will insert 0, and BN254.MODULUS into the tree
    leafHashes.unshift(0n);
    leafHashes.push(BN254_MODULUS_MINUS_ONE);

    this.leaves = leafHashes

    await this.computeZeroes()

    // Build level 0 padded to capacity with zero leaf value
    const level0: Node[] = new Array(cap)
    for (let i = 0; i < cap; i += 1) level0[i] = leafHashes[i] ?? ZERO_NODE
    this.layers = new Array(this.depth + 1)
    this.layers[0] = level0

    for (let level = 0; level < this.depth; level += 1) {
      const curr = this.layers[level]
      const next: Node[] = new Array(Math.ceil(curr.length / 2))
      for (let i = 0; i < curr.length; i += 2) {
        const left = curr[i] ?? this.zeroes[level]
        const right = curr[i + 1] ?? this.zeroes[level]
        next[i >> 1] = await this.hash([left, right])
      }
      this.layers[level + 1] = next
    }
  }

  public exists(leaf: Node): boolean {
    const { exists } = this.findBoundaries(leaf)
    return exists
  }

  public createMembershipProof(leaf: Node): MembershipProof {
    const { exists, index } = this.findBoundaries(leaf)
    if (!exists || index === null) throw new Error("Leaf not found")

    const siblings: Node[] = []
    const path: number[] = []

    let idx = index
    for (let level = 0; level < this.depth; level += 1) {
      const isRight = idx & 1
      const siblingIndex = isRight ? idx - 1 : idx + 1
      const sibling = this.layers[level][siblingIndex] ?? this.zeroes[level]
      siblings.push(sibling)
      path.push(isRight)
      idx >>= 1
    }

    return { root: this.root, leaf, leafIndex: index, siblings }
  }

  public static async verifyMembershipProof(
    proof: MembershipProof,
    hash: AsyncHashFunction,
  ): Promise<boolean> {
    let node = proof.leaf
    // Calculate the path based on the index
    let path = proof.leafIndex;
    for (let i = 0; i < proof.siblings.length; i += 1) {
      const sibling = proof.siblings[i]
      const isRight = (path & 1) === 1
      path >>= 1

      node = await hash(isRight ? [sibling, node] : [node, sibling])
    }
    return node === proof.root
  }

  public createNonMembershipProof(target: Node): SortedNonMembershipProof {
    const { exists, leftIndex, rightIndex } = this.findBoundaries(target)
    if (exists) throw new Error("Target exists; use membership proof")

    const left =
      leftIndex !== null
        ? { leaf: this.leaves[leftIndex], proof: this.createMembershipProof(this.leaves[leftIndex]) }
        : undefined
    const right =
      rightIndex !== null
        ? {
            leaf: this.leaves[rightIndex],
            proof: this.createMembershipProof(this.leaves[rightIndex]),
          }
        : undefined

    return { root: this.root, target, left, right }
  }

  public static async verifyNonMembershipProof(
    nm: SortedNonMembershipProof,
    hash: AsyncHashFunction,
  ): Promise<boolean> {
    if (!nm.left && !nm.right) return false

    if (nm.left) {
      const ok = await AsyncOrderedMT.verifyMembershipProof(nm.left.proof, hash)
      if (!ok || nm.left.proof.root !== nm.root) return false
      if (!(nm.left.leaf < nm.target)) return false
    }

    if (nm.right) {
      const ok = await AsyncOrderedMT.verifyMembershipProof(nm.right.proof, hash)
      if (!ok || nm.right.proof.root !== nm.root) return false
      if (!(nm.target < nm.right.leaf)) return false
    }

    if (nm.left && nm.right) {
      if (nm.left.leaf > nm.target) return false
      if (nm.right.leaf < nm.target) return false
      if (!(nm.left.leaf < nm.right.leaf)) return false
    }

    return true
  }

  /**
   * Binary search boundaries for target leaf among sorted unique leaves.
   */
  private findBoundaries(leaf: Node): {
    exists: boolean
    index: number | null
    leftIndex: number | null
    rightIndex: number | null
  } {
    const numberOfLeaves = this.leaves.length
    if (numberOfLeaves === 0) return { exists: false, index: null, leftIndex: null, rightIndex: null }

    let low = 0
    let high = numberOfLeaves
    while (low < high) {
      const mid = (low + high) >> 1
      const midVal = this.leaves[mid]
      if (midVal < leaf) low = mid + 1
      else high = mid
    }

    const pos = low
    const exists = pos < numberOfLeaves && this.leaves[pos] === leaf
    const leftIndex = (pos - 1) >= 0 ? (exists ? pos - 1 : pos - 1) : null
    const rightIndex = (exists ? pos + 1 : pos) < numberOfLeaves ? (exists ? pos + 1 : pos) : null

    return { exists, index: exists ? pos : null, leftIndex, rightIndex }
  }

  private async computeZeroes() {
    this.zeroes = new Array(this.depth)
    let z = ZERO_NODE
    for (let i = 0; i < this.depth; i += 1) {
      z = await this.hash([z, z])
      this.zeroes[i] = z
    }
  }

  /**
   * Serialize the tree
   */
  public serialize() {
    return this.layers.map((layer) => layer.map(node => `0x${node.toString(16).padStart(64, '0')}`));
  }


  public async loadFromSerialized(serialized: string[][]) {
    if (!Array.isArray(serialized) || serialized.length === 0) {
      throw new Error("Invalid serialized tree: empty payload")
    }

    const expectedLayers = this.depth + 1
    if (serialized.length !== expectedLayers) {
      throw new Error(
        `Serialized tree depth mismatch: expected ${expectedLayers} layers, got ${serialized.length}`,
      )
    }

    // Rebuild nodes in-place
    for (let level = 0; level < serialized.length; level += 1) {
      const layer = serialized[level]
      if (!Array.isArray(layer)) {
        throw new Error(`Invalid serialized tree: layer ${level} is not an array`)
      }
      this.layers[level] = layer.map((node) => BigInt(node))
    }

    // Validate structural invariants: each level must have expected number of nodes
    for (let level = 0; level <= this.depth; level += 1) {
      const expectedLen = 1 << (this.depth - level)
      const actualLen = this.layers[level]?.length
      if (actualLen !== expectedLen) {
        throw new Error(
          `Invalid serialized tree: layer ${level} length ${actualLen} !== expected ${expectedLen}`,
        )
      }
    }
    // Validate root presence
    if (this.layers[this.depth][0] === undefined) {
      throw new Error("Invalid serialized tree: missing root")
    }

    await this.computeZeroes()

    // Reconstruct leaves from layer 0 by trimming trailing ZERO_NODE padding
    const l0 = this.layers[0]
    let count = l0.length
    while (count > 0 && l0[count - 1] === ZERO_NODE) count -= 1
    this.leaves = l0.slice(0, count)
  }


  public static async fromSerialized(serialized: string[][], hash: AsyncHashFunction) { 
    const smt = new AsyncOrderedMT(serialized.length - 1, hash)
    await smt.loadFromSerialized(serialized)
    return smt
  }
}

