/**
 * Circuit Registry utilities
 *
 * The Circuit Registry stores the root of a merkle tree whose leaves are the vkey hashes of every
 * circuit in a release, sorted in ascending order.
 */
import { MERKLE_TREE_ZERO_VALUE } from "."
import { computeMerkleProof } from "../merkle-tree"
import { CircuitManifest, PackagedCircuit } from "../types"
import { AsyncMerkleTree } from "./merkle"

/**
 * Canonical merkle tree height for the circuit registry
 */
export const CIRCUIT_REGISTRY_HEIGHT = 12 // Max leaves: 2^12 = 4096

const CIRCUIT_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const CIRCUIT_VERSION_BYTES32_PATTERN = /^0x([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})0{52}$/i
const MAX_CIRCUIT_VERSION_PART = 0xffff

/**
 * Calculate the canonical circuit root from packaged circuits or vkey hashes
 * @param param An object containing either:
 *              - circuits: Array of PackagedCircuit objects to use for calculating the root
 *              - hashes: Array of vkey hashes to use for calculating the root
 * @returns Circuit root used in the Circuit Registry
 */
export async function calculateCircuitRoot(
  param: Partial<{ circuits: PackagedCircuit[]; hashes: string[] }>,
) {
  let leaves: bigint[]
  if (param.circuits !== undefined) {
    leaves = param.circuits.map((circuit) => BigInt(circuit.vkey_hash))
  } else if (param.hashes !== undefined) {
    leaves = param.hashes.map((hash) => BigInt(hash))
  } else throw new Error("Either circuits or hashes must be provided")
  // Sort leaves to ensure consistent roots
  leaves.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
  // Build the merkle tree and return the root
  const tree = new AsyncMerkleTree(CIRCUIT_REGISTRY_HEIGHT, 2)
  await tree.initialize(MERKLE_TREE_ZERO_VALUE, leaves)
  return tree.root
}

export function getLeavesFromCircuitManifest(circuitManifest: CircuitManifest) {
  let leaves: bigint[]
  if (circuitManifest.circuits !== undefined) {
    leaves = Object.values(circuitManifest.circuits).map((circuit) => BigInt(circuit.hash))
  } else {
    throw new Error("Circuits must be provided")
  }
  // Sort leaves to ensure consistent roots
  leaves.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
  return leaves
}

export async function getCircuitMerkleProof(
  circuitKeyHash: string,
  circuitManifest: CircuitManifest,
  computeMerkleProofFn: (
    leaves: bigint[],
    index: number,
    height: number,
  ) => Promise<{
    root: string
    index: number
    path: string[]
  }> = computeMerkleProof,
) {
  const leaves = getLeavesFromCircuitManifest(circuitManifest)
  const index = leaves.findIndex((leaf) => leaf === BigInt(circuitKeyHash))
  return computeMerkleProofFn(leaves, index, CIRCUIT_REGISTRY_HEIGHT)
}

/**
 * Encode a circuits version as a bytes32: major, minor and patch as 2-byte big-endian integers,
 * followed by zero bytes
 */
export function circuitVersionToBytes32(version: string): string {
  const parts = CIRCUIT_VERSION_PATTERN.exec(version)?.slice(1).map(Number)
  if (!parts || parts.some((part) => part > MAX_CIRCUIT_VERSION_PART)) {
    throw new Error(
      `Invalid circuits version "${version}": expected MAJOR.MINOR.PATCH, each part from 0 to 65535`,
    )
  }
  if (parts.every((part) => part === 0)) {
    throw new Error('Invalid circuits version "0.0.0": it would encode to zero')
  }

  const encodedParts = parts.map((part) => part.toString(16).padStart(4, "0")).join("")
  return `0x${encodedParts.padEnd(64, "0")}`
}

/**
 * Decode a bytes32 into its circuits version
 */
export function bytes32ToCircuitVersion(bytes32: string): string {
  const parts = CIRCUIT_VERSION_BYTES32_PATTERN.exec(bytes32)
    ?.slice(1)
    .map((part) => parseInt(part, 16))
  if (!parts || parts.every((part) => part === 0)) {
    throw new Error(
      `Invalid circuits version bytes32 "${bytes32}": expected three 2-byte parts, not all zero, followed by 26 zero bytes`,
    )
  }

  return parts.join(".")
}
