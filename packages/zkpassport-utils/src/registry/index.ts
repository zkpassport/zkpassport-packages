import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { Binary } from "../binary"
import {
  CircuitManifest,
  ECPublicKey,
  PackagedCertificate,
  PackagedCertificatesFile,
  PackagedCircuit,
  RSAPublicKey,
  TwoLetterCode,
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
export const HASH_ALGORITHM_SHA224 = 2
export const HASH_ALGORITHM_SHA256 = 3
export const HASH_ALGORITHM_SHA384 = 4
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
 * @deprecated Used by the old registry
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
 * @deprecated Use tagsArrayToBitsFlag instead
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
 * @deprecated Use bitsFlagToTagsArray instead
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

export function tagsArrayToBitsFlag(tags: TwoLetterCode[], bitSize: number = 253): bigint[] {
  const possibleTags = Math.pow(26, 2)
  const numLimbs = Math.ceil(possibleTags / bitSize)
  const bitsFlags: bigint[] = Array(numLimbs).fill(0n)
  const START_INDEX = "A".charCodeAt(0)
  for (const tag of tags) {
    const bitIndex = (tag.charCodeAt(0) - START_INDEX) * 26 + tag.charCodeAt(1) - START_INDEX
    const limbIndex = Math.floor(bitIndex / bitSize)
    bitsFlags[limbIndex] |= 1n << BigInt(bitIndex % bitSize)
  }
  return bitsFlags
}

export function bitsFlagToTagsArray(bitsFlags: bigint[], bitSize: number = 253): TwoLetterCode[] {
  const possibleTags = Math.pow(26, 2)
  const numLimbs = Math.ceil(possibleTags / bitSize)
  const tags: TwoLetterCode[] = []
  const START_INDEX = "A".charCodeAt(0)
  for (let i = 0; i < numLimbs; i++) {
    for (let j = 0; j < bitSize; j++) {
      const bitIndex = i * bitSize + j
      const limbIndex = Math.floor(bitIndex / bitSize)
      if ((bitsFlags[limbIndex] & (1n << BigInt(bitIndex % bitSize))) === 0n) {
        continue
      }
      const firstLetter = String.fromCharCode(Math.floor(bitIndex / 26) + START_INDEX)
      const secondLetter = String.fromCharCode((bitIndex % 26) + START_INDEX)
      tags.push(`${firstLetter}${secondLetter}` as TwoLetterCode)
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
  options?: { tags?: TwoLetterCode[]; type?: number; version?: number },
): Promise<bigint> {
  // Leaf node hash calculation based on Packaged Certificates file format version
  const version = options?.version ?? 0
  assert(version === 0 || version === 1, `Unsupported Packaged Certificates version: ${version}`)
  // Convert tags to byte flags
  const tags = options?.tags
    ? tagsArrayToBitsFlag(options.tags)
    : cert?.tags
      ? tagsArrayToBitsFlag(cert.tags)
      : [0n, 0n, 0n]
  // Tags must be exactly 3 fields
  assert(tags.length === 3, `Tags must be exactly 3 fields`)
  // Certificate type
  const type = options?.type ?? CERT_TYPE_CSCA
  assert(type >= 0 && type <= 255, `Certificate type must fit in a single byte: ${type}`)
  // Ensure country code is 3 characters
  assert(cert?.country?.length === 3, `Country code must be 3 characters: ${cert?.country}`)
  const publicKeyBytes = publicKeyToBytes(cert.public_key)

  // Version 0 leaf hash calculation
  if (version === 0) {
    // Return the version 0 canonical leaf hash of the certificate
    return poseidon2HashAsync([
      ...tags,
      BigInt(
        packBeBytesIntoFields(
          new Uint8Array([
            type,
            cert.country.charCodeAt(0),
            cert.country.charCodeAt(1),
            cert.country.charCodeAt(2),
          ]),
          31,
        )[0],
      ),
      ...packBeBytesIntoFields(publicKeyBytes, 31).map((hex) => BigInt(hex)),
    ])
  }

  // Version 1 leaf hash calculation
  else if (version === 1) {
    // Fingerprint (Poseidon2 hash of certificate DER bytes)
    assert(cert.fingerprint !== undefined, `Certificate fingerprint required`)
    const fingerprint = BigInt(cert.fingerprint!)
    // Certificate expiry (validity.not_after timestamp represented as 4 bytes / 32 bits)
    const expiry = new Uint8Array(4)
    expiry[0] = (cert.validity.not_after >> 24) & 0xff
    expiry[1] = (cert.validity.not_after >> 16) & 0xff
    expiry[2] = (cert.validity.not_after >> 8) & 0xff
    expiry[3] = cert.validity.not_after & 0xff
    // Return the version 1 canonical leaf hash of the certificate
    return poseidon2HashAsync([
      ...tags,
      BigInt(
        packBeBytesIntoFields(
          new Uint8Array([
            type,
            cert.country.charCodeAt(0),
            cert.country.charCodeAt(1),
            cert.country.charCodeAt(2),
            ...expiry,
          ]),
          31,
        )[0],
      ),
      fingerprint,
      ...packBeBytesIntoFields(publicKeyBytes, 31).map((hex) => BigInt(hex)),
    ])
  } else {
    throw new Error(`Unsupported Packaged Certificates version: ${version}`)
  }
}

/**
 * Canonically generate merkle tree leaf hashes from certificates
 * @param certs Array of packaged certificates
 * @returns Array of leaf hashes as bigints
 */
export async function getCertificateLeafHashes(
  certs: PackagedCertificate[],
  version: number = 0,
): Promise<bigint[]> {
  const leaves = await Promise.all(certs.map((c) => getCertificateLeafHash(c, { version })))
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
  version: number = 0,
): Promise<AsyncMerkleTree> {
  const leaves = await getCertificateLeafHashes(certs, version)
  const tree = new AsyncMerkleTree(CERTIFICATE_REGISTRY_HEIGHT, 2)
  await tree.initialize(0n, leaves)
  return tree
}

/**
 * Calculate the canonical certificate root from packaged certificates
 * @param certs Array of packaged certificates
 * @param version Version of the packaged certificates file format (defaults to 0 if not specified)
 * @returns Certificate root used in the Certificate Registry
 */
export async function calculateCertificateRoot(certs: PackagedCertificate[], version: number = 0) {
  const tree = await buildMerkleTreeFromCerts(certs, version)
  return tree.root
}

/**
 * Calculate the canonical certificate root from a packaged certificates file
 * @param packagedCerts Packaged certificates file
 * @returns Certificate root used in the Certificate Registry
 */
export async function calculatePackagedCertificatesRoot(packagedCerts: PackagedCertificatesFile) {
  const tree = await buildMerkleTreeFromCerts(packagedCerts.certificates, packagedCerts.version)
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
