// c.f. https://github.com/zkpassport/zk-kit/blob/main/packages/imt/src/async-imt.ts
import {
  requireArray,
  requireFunction,
  requireNumber,
  requireObject,
  requireTypes,
} from "@zk-kit/utils"

/**
 * It represents a node of the tree, which can be a number, a string or a bigint.
 */
export type IMTNode = number | string | bigint

/**
 * The hash function is used to compute the nodes of the tree.
 * In a binary Merkle tree, each node is the hash of its two children.
 */
export type IMTHashFunction = (values: IMTNode[]) => IMTNode

export type IMTAsyncHashFunction = (values: IMTNode[]) => Promise<IMTNode>

/**
 * The Merkle Proof contains the necessary parameters to enable the
 * verifier to be certain that a leaf belongs to the tree. Given the value
 * of the leaf and its index, it is possible to traverse the tree by
 * recalculating the hashes up to the root and using the node siblings.
 * If the calculated root matches the root in the proof, then the leaf
 * belongs to the tree. It's important to note that the function used
 * to generate the proof and the one used to verify it must use the
 * same hash function.
 */
export type IMTMerkleProof = {
  root: any
  leaf: any
  leafIndex: number
  siblings: any[]
  pathIndices: number[]
}

/**
 * An {@link IMT} (aka Incremental Merkle Tree) is a type of data structure used in cryptography and
 * computer science for efficiently verifying the integrity of a large set of data,
 * especially in situations where new data is added over time. It is based on the concept
 * of a Merkle tree, and its key feature is its ability to efficiently update the tree
 * when new data is added or existing data is modified.
 * In this implementation, the tree is constructed using a fixed {@link IMT#depth}
 * value, and a list of {@link IMT#zeroes} (one for each level) is used to compute the
 * hash of a node when not all of its children are defined. The number of children for each
 * node can also be specified with the {@link IMT#arity} parameter.
 */
export class AsyncIMT {
  /**
   * The matrix where all the tree nodes are stored. The first index indicates
   * the level of the tree, while the second index represents the node's
   * position within that specific level.
   */
  private readonly _nodes: IMTNode[][]
  /**
   * A list of zero values calculated during the initialization of the tree.
   * The list contains one value for each level of the tree, and the value for
   * a given level is equal to the hash of the previous level's value.
   * The first value is the zero hash provided by the user.
   * These values are used to calculate the hash of a node in case some of its
   * children are missing.
   */
  private readonly _zeroes: IMTNode[]
  /**
   * The hash function used to compute the tree nodes.
   */
  private readonly _hash: IMTAsyncHashFunction
  /**
   * The depth of the tree, which is the number of edges from the node to the
   * tree's root node.
   */
  private readonly _depth: number
  /**
   * The number of children per node.
   */
  private readonly _arity: number

  /**
   * It initializes the tree with an hash function, the depth, the zero value to use for zeroes
   * and the arity (i.e. the number of children for each node). It also takes an optional parameter
   * to initialize the tree with a list of leaves.
   * @param hash The hash function used to create nodes.
   * @param depth The tree depth.
   * @param arity The number of children for each node.
   */
  constructor(hash: IMTAsyncHashFunction, depth: number, arity = 2) {
    requireFunction(hash, "hash")
    requireNumber(depth, "depth")
    requireNumber(arity, "arity")

    // Initialize the attributes.
    this._hash = hash
    this._depth = depth
    this._zeroes = []
    this._nodes = []
    this._arity = arity
  }

  /**
   * The root of the tree. This value doesn't need to be stored as
   * it is always the first and unique element of the last level of the tree.
   * Its value can be retrieved in {@link IMT#_nodes}.
   * @returns The root hash of the tree.
   */
  public get root(): IMTNode {
    return this._nodes[this.depth][0]
  }

  /**
   * The depth of the tree, which equals the number of levels - 1.
   * @returns The depth of the tree.
   */
  public get depth(): number {
    return this._depth
  }

  /**
   * The leaves of the tree. They can be retrieved from the first
   * level of the tree using {@link IMT#_nodes}. The returned
   * value is a copy of the array and not the original object.
   * @returns The list of tree leaves.
   */
  public get leaves(): IMTNode[] {
    return this._nodes[0].slice()
  }

  /**
   * The list of zero values calculated during the initialization of the tree.
   * @returns The list of pre-computed zeroes.
   */
  public get zeroes(): IMTNode[] {
    return this._zeroes
  }

  /**
   * The number of children per node.
   * @returns The number of children per node.
   */
  public get arity(): number {
    return this._arity
  }

  /**
   * It returns the index of the first occurrence of a leaf in the tree.
   * If the leaf does not exist it returns -1.
   * @param leaf A leaf of the tree.
   * @returns The index of the leaf.
   */
  public indexOf(leaf: IMTNode): number {
    requireTypes(leaf, "leaf", ["number", "string", "bigint"])

    return this._nodes[0].indexOf(leaf)
  }

  public async initialize(zeroValue: IMTNode, leaves: IMTNode[] = []) {
    requireTypes(zeroValue, "zeroValue", ["number", "string", "bigint"])
    requireObject(leaves, "leaves")

    if (leaves.length > this._arity ** this._depth) {
      throw new Error(`The tree cannot contain more than ${this._arity ** this._depth} leaves`)
    }

    for (let level = 0; level < this.depth; level += 1) {
      this._zeroes.push(zeroValue)
      this._nodes[level] = []
      // There must be a zero value for each tree level (except the root).
      zeroValue = await this._hash(Array(this._arity).fill(zeroValue))
    }

    this._nodes[this.depth] = []

    // It initializes the tree with a list of leaves if there are any.
    if (leaves.length > 0) {
      this._nodes[0] = leaves

      for (let level = 0; level < this.depth; level += 1) {
        for (let index = 0; index < Math.ceil(this._nodes[level].length / this.arity); index += 1) {
          const position = index * this.arity
          const children = []

          for (let i = 0; i < this.arity; i += 1) {
            children.push(this._nodes[level][position + i] ?? this.zeroes[level])
          }

          this._nodes[level + 1][index] = await this._hash(children)
        }
      }
    } else {
      // If there are no leaves, the default root is the last zero value.
      this._nodes[this.depth][0] = zeroValue
    }

    // Freeze the array objects. It prevents unintentional changes.
    Object.freeze(this._zeroes)
    Object.freeze(this._nodes)
  }

  /**
   * The leaves are inserted incrementally. If 'i' is the index of the last
   * leaf, the new one will be inserted at position 'i + 1'. Every time a
   * new leaf is inserted, the nodes that separate the new leaf from the root
   * of the tree are created or updated if they already exist, from bottom to top.
   * When a node has only one child (the left one), its value is the hash of that
   * node and the zero value of that level. Otherwise, the hash of the children
   * is calculated.
   * @param leaf The new leaf to be inserted in the tree.
   */
  public async insert(leaf: IMTNode) {
    requireTypes(leaf, "leaf", ["number", "string", "bigint"])

    if (this._nodes[0].length >= this.arity ** this.depth) {
      throw new Error("The tree is full")
    }

    let node = leaf
    let index = this._nodes[0].length

    for (let level = 0; level < this.depth; level += 1) {
      const position = index % this.arity
      const levelStartIndex = index - position
      const levelEndIndex = levelStartIndex + this.arity

      const children = []
      this._nodes[level][index] = node

      for (let i = levelStartIndex; i < levelEndIndex; i += 1) {
        if (i < this._nodes[level].length) {
          children.push(this._nodes[level][i])
        } else {
          children.push(this._zeroes[level])
        }
      }

      node = await this._hash(children)
      index = Math.floor(index / this.arity)
    }

    this._nodes[this.depth][0] = node
  }

  /**
   * It deletes a leaf from the tree. It does not remove the leaf from
   * the data structure, but rather it sets the leaf to be deleted to the zero value.
   * @param index The index of the leaf to be deleted.
   */
  public async delete(index: number) {
    await this.update(index, this.zeroes[0])
  }

  /**
   * It updates a leaf in the tree. It's very similar to the {@link IMT#insert} function.
   * @param index The index of the leaf to be updated.
   * @param newLeaf The new leaf to be inserted.
   */
  public async update(index: number, newLeaf: IMTNode) {
    requireNumber(index, "index")

    if (index < 0 || index >= this._nodes[0].length) {
      throw new Error("The leaf does not exist in this tree")
    }

    if (newLeaf === this._nodes[0][index]) return

    let node = newLeaf

    for (let level = 0; level < this.depth; level += 1) {
      const position = index % this.arity
      const levelStartIndex = index - position
      const levelEndIndex = levelStartIndex + this.arity

      const children = []
      this._nodes[level][index] = node

      for (let i = levelStartIndex; i < levelEndIndex; i += 1) {
        if (i < this._nodes[level].length) {
          children.push(this._nodes[level][i])
        } else {
          children.push(this.zeroes[level])
        }
      }

      node = await this._hash(children)
      index = Math.floor(index / this.arity)
    }

    this._nodes[this.depth][0] = node
  }

  /**
   * It creates a {@link IMTMerkleProof} for a leaf of the tree.
   * That proof can be verified by this tree using the same hash function.
   * @param index The index of the leaf for which a Merkle proof will be generated.
   * @returns The Merkle proof of the leaf.
   */
  public createProof(index: number): IMTMerkleProof {
    requireNumber(index, "index")

    if (index < 0 || index >= this._nodes[0].length) {
      throw new Error("The leaf does not exist in this tree")
    }

    const siblings: IMTNode[][] = []
    const pathIndices: number[] = []
    const leafIndex = index

    for (let level = 0; level < this.depth; level += 1) {
      const position = index % this.arity
      const levelStartIndex = index - position
      const levelEndIndex = levelStartIndex + this.arity

      pathIndices[level] = position
      siblings[level] = []

      for (let i = levelStartIndex; i < levelEndIndex; i += 1) {
        if (i !== index) {
          if (i < this._nodes[level].length) {
            siblings[level].push(this._nodes[level][i])
          } else {
            siblings[level].push(this.zeroes[level])
          }
        }
      }

      index = Math.floor(index / this.arity)
    }

    return { root: this.root, leaf: this._nodes[0][leafIndex], pathIndices, siblings, leafIndex }
  }

  /**
   * It verifies a {@link IMTMerkleProof} to confirm that a leaf indeed
   * belongs to a tree.  Does not verify that the node belongs to this
   * tree in particular.  Equivalent to `IMT.verifyProof(proof, this._hash)`.
   *
   * @param proof The Merkle tree proof.
   * @returns True if the leaf is part of the tree, and false otherwise.
   */
  public async verifyProof(proof: IMTMerkleProof): Promise<boolean> {
    return AsyncIMT.verifyProof(proof, this._hash)
  }

  /**
   * It verifies a {@link IMTMerkleProof} to confirm that a leaf indeed
   * belongs to a tree.
   * @param proof The Merkle tree proof.
   * @param hash The hash function used to compute the tree nodes.
   * @returns True if the leaf is part of the tree, and false otherwise.
   */
  public static async verifyProof(
    proof: IMTMerkleProof,
    hash: IMTAsyncHashFunction,
  ): Promise<boolean> {
    requireObject(proof, "proof")
    requireTypes(proof.root, "proof.root", ["number", "string", "bigint"])
    requireTypes(proof.leaf, "proof.leaf", ["number", "string", "bigint"])
    requireArray(proof.siblings, "proof.siblings")
    requireArray(proof.pathIndices, "proof.pathIndices")

    let node = proof.leaf

    for (let i = 0; i < proof.siblings.length; i += 1) {
      const children = proof.siblings[i].slice()

      children.splice(proof.pathIndices[i], 0, node)

      node = await hash(children)
    }

    return proof.root === node
  }
}
