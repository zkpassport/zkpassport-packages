import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { Binary } from "../binary"
import {
  CircuitManifest,
  ECPublicKey,
  PackagedCertificate,
  PackagedCircuit,
  RSAPublicKey,
} from "../types"
import { assert, packBeBytesIntoFields } from "../utils"
import { AsyncMerkleTree } from "./merkle"
import { computeMerkleProof } from ".."
export { cidv0ToHex, hexToCidv0 } from "./cid"

/**
 * Canonical merkle tree height for the certificate registry
 */
export const CERTIFICATE_REGISTRY_HEIGHT = 16

/**
 * Canonical merkle tree height for the circuit registry
 */
export const CIRCUIT_REGISTRY_HEIGHT = 12

/**
 * Canonical hash algorithm identifiers for the certificate registry
 */
export const HASH_ALGORITHM_SHA1 = 1
export const HASH_ALGORITHM_SHA256 = 2
export const HASH_ALGORITHM_SHA384 = 3
export const HASH_ALGORITHM_SHA224 = 4
export const HASH_ALGORITHM_SHA512 = 5

/**
 * Canonical certificate type for CSCA (Country Signing Certificate Authority)
 */
export const CERT_TYPE_CSCA = 1

/**
 * Canonical certificate type for DSC (Document Signing Certificate)
 */
export const CERT_TYPE_DSC = 2

/**
 * Canonical list of tags for packaged certificates
 * This is used to identify the publisher of the masterlist
 * this certificate is from
 */
export const PACKAGED_CERTIFICATE_TAGS = ["ICAO", "DE", "NL", "IT", "ES", "CH", "SE", "IN", "BD"]

/**
 * Certificate Registry ID
 * Used to identify the certificate registry in the root registry
 */
export const CERTIFICATE_REGISTRY_ID = 1

/**
 * Circuit Registry ID
 * Used to identify the circuit registry in the root registry
 */
export const CIRCUIT_REGISTRY_ID = 2

/**
 * Convert an array of certificate tags to a bigint byte flag
 * Each tag position in PACKAGED_CERTIFICATE_TAGS represents a byte flag
 * ICAO is the LSB (least significant byte)
 * @param tags Array of certificate tags to convert to byte flag
 * @returns bigint representation of byte flags
 */
export function tagsArrayToByteFlag(tags: string[]): bigint {
  let byteFlag = 0n
  for (const tag of tags) {
    const index = PACKAGED_CERTIFICATE_TAGS.indexOf(tag)
    if (index === -1) {
      throw new Error(`Invalid tag: ${tag}`)
    }
    // Shift 0xFF (255) to the left by the byte position (8 bits per flag)
    byteFlag |= 0xffn << BigInt(index * 8)
  }
  return byteFlag
}

/**
 * Convert a byte flag to an array of certificate tags
 * @param byteFlag bigint representation of byte flags
 * @returns Array of certificate tags
 */
export function byteFlagToTagsArray(byteFlag: bigint): string[] {
  const tags: string[] = []
  for (let i = 0; i < PACKAGED_CERTIFICATE_TAGS.length; i++) {
    // Check if the respective byte is set (8 bits per flag)
    const mask = 0xffn << BigInt(i * 8)
    if ((byteFlag & mask) === mask) {
      tags.push(PACKAGED_CERTIFICATE_TAGS[i])
    }
  }
  return tags
}

/**
 * Get the canonical hash algorithm identifier for a hash algorithm string
 */
export function getHashAlgorithmIdentifier(hashAlgo: string): number {
  const hashAlgorithmMap: Record<string, number> = {
    "SHA-1": HASH_ALGORITHM_SHA1,
    "SHA-224": HASH_ALGORITHM_SHA224,
    "SHA-256": HASH_ALGORITHM_SHA256,
    "SHA-384": HASH_ALGORITHM_SHA384,
    "SHA-512": HASH_ALGORITHM_SHA512,
  }
  if (hashAlgorithmMap[hashAlgo] === undefined) {
    throw new Error(`Unsupported hash algorithm: ${hashAlgo}`)
  }
  return hashAlgorithmMap[hashAlgo]
}

/**
 * Canonically serialize an RSA or EC public key into bytes
 */
export function publicKeyToBytes(publicKey: ECPublicKey | RSAPublicKey): Uint8Array {
  if (publicKey.type === "RSA") {
    return Binary.from(publicKey.modulus).toUInt8Array()
  } else if (publicKey.type === "EC") {
    return Binary.from(publicKey.public_key_x)
      .concat(Binary.from(publicKey.public_key_y))
      .toUInt8Array()
  } else {
    throw new Error("Unsupported signature algorithm")
  }
}

/**
 * Canonically generate a leaf hash from a packaged certificate using Poseidon2
 * @param cert Packaged certificate to generate a leaf hash for
 * @param options Optional options for the leaf hash
 * @returns Leaf hash as a bigint
 */
export async function getCertificateLeafHash(
  cert: PackagedCertificate,
  options?: { tags?: string[]; type?: number; hashAlgId?: number },
): Promise<bigint> {
  // Convert tags to byte flags
  const tags = options?.tags
    ? tagsArrayToByteFlag(options.tags)
    : cert?.tags
      ? tagsArrayToByteFlag(cert.tags)
      : 0n
  // Certificate type
  const type = options?.type ?? CERT_TYPE_CSCA
  assert(type >= 0 && type <= 255, `Certificate type must fit in a single byte: ${type}`)
  // Ensure country code is 3 characters
  assert(cert?.country?.length === 3, `Country code must be 3 characters: ${cert?.country}`)
  // Hash algorithm identifier
  const hashAlgId = options?.hashAlgId ?? getHashAlgorithmIdentifier(cert?.hash_algorithm)
  assert(
    hashAlgId >= 0 && hashAlgId <= 255,
    `Hash algorithm identifier must fit in a single byte: ${hashAlgId}`,
  )
  const publicKeyBytes = publicKeyToBytes(cert.public_key)
  // Return the canonical leaf hash of the certificate
  return poseidon2HashAsync([
    tags,
    BigInt(
      packBeBytesIntoFields(
        new Uint8Array([
          type,
          cert.country.charCodeAt(0),
          cert.country.charCodeAt(1),
          cert.country.charCodeAt(2),
          hashAlgId,
        ]),
        31,
      )[0],
    ),
    ...packBeBytesIntoFields(publicKeyBytes, 31).map((hex) => BigInt(hex)),
  ])
}

/**
 * Canonically generate merkle tree leaf hashes from certificates
 * @param certs Array of packaged certificates
 * @returns Array of leaf hashes as bigints
 */
export async function getCertificateLeafHashes(certs: PackagedCertificate[]): Promise<bigint[]> {
  const leaves = await Promise.all(certs.map((c) => getCertificateLeafHash(c)))
  leaves.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
  return leaves
}

/**
 * Canonically build a merkle tree from certificates
 * @param certs Array of packaged certificates
 * @returns AsyncMerkleTree
 */
export async function buildMerkleTreeFromCerts(
  certs: PackagedCertificate[],
): Promise<AsyncMerkleTree> {
  const leaves = await getCertificateLeafHashes(certs)
  const tree = new AsyncMerkleTree(CERTIFICATE_REGISTRY_HEIGHT, 2)
  await tree.initialize(0n, leaves)
  return tree
}

/**
 * Calculate the canonical certificate root from packaged certificates
 * @param certs Array of packaged certificates
 * @returns Certificate root used in the Certificate Registry
 */
export async function calculateCertificateRoot(certs: PackagedCertificate[]) {
  const tree = await buildMerkleTreeFromCerts(certs)
  return tree.root
}

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
  await tree.initialize(0n, leaves)
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
