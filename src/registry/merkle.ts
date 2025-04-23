import { poseidon2HashAsync } from "@zkpassport/poseidon2"

/**
 * Type for a node in the Merkle tree
 */
export type MerkleTreeNode = string | bigint

/**
 * Async Incremental Merkle Tree implementation
 */
export class AsyncMerkleTree {
  private readonly nodes: MerkleTreeNode[][]
  private readonly zeroes: MerkleTreeNode[]
  private readonly depth: number
  private readonly arity: number

  /**
   * Create a new Merkle tree
   */
  constructor(depth: number, arity: number = 2) {
    this.depth = depth
    this.arity = arity
    this.zeroes = []
    this.nodes = []
  }

  /**
   * Get the root hash of the tree
   */
  get root(): string {
    return `0x${this.nodes[this.depth][0].toString(16).padStart(64, "0")}`
  }

  /**
   * Get the leaves of the tree
   */
  get leaves(): MerkleTreeNode[] {
    return this.nodes[0].slice()
  }

  /**
   * Initialize the tree with a zero value and optional leaves
   */
  async initialize(zeroValue: MerkleTreeNode, leaves: MerkleTreeNode[] = []): Promise<void> {
    if (leaves.length > this.arity ** this.depth) {
      throw new Error(`The tree cannot contain more than ${this.arity ** this.depth} leaves`)
    }

    // Check for duplicate leaves
    const uniqueLeaves = new Set(leaves.map((leaf) => leaf.toString()))
    if (uniqueLeaves.size !== leaves.length) throw new Error("Duplicate leaves")

    for (let level = 0; level < this.depth; level += 1) {
      this.zeroes.push(zeroValue)
      this.nodes[level] = []
      // Calculate the zero value for the next level
      zeroValue = await poseidon2HashAsync(
        Array(this.arity)
          .fill(zeroValue)
          .map((v) => BigInt(v)),
      )
    }

    this.nodes[this.depth] = []

    // Initialize the tree with leaves if provided
    if (leaves.length > 0) {
      this.nodes[0] = leaves

      for (let level = 0; level < this.depth; level += 1) {
        for (let index = 0; index < Math.ceil(this.nodes[level].length / this.arity); index += 1) {
          const position = index * this.arity
          const children: MerkleTreeNode[] = []

          for (let i = 0; i < this.arity; i += 1) {
            children.push(this.nodes[level][position + i] ?? this.zeroes[level])
          }

          this.nodes[level + 1][index] = await poseidon2HashAsync(children.map((v) => BigInt(v)))
        }
      }
    } else {
      // If there are no leaves, the default root is the last zero value
      this.nodes[this.depth][0] = zeroValue
    }
  }

  /**
   * Serialize the tree
   */
  public serialize(): string[][] {
    return this.nodes.map((layer) => layer.map((node) => node.toString(16)))
  }
}
