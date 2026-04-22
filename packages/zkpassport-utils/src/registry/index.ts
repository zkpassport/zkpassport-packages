import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { Binary } from "../binary"
import {
  CircuitManifest,
  ECPublicKey,
  PackagedCertificate,
  PackagedCertificatesFile,
  PackagedCertificatesFileV1,
  PackagedCircuit,
  IntermediateCertificateRevocation,
  RSAPublicKey,
  TwoLetterCode,
} from "../types"
import { assert, packBeBytesIntoFields } from "../utils"
import { AsyncMerkleTree } from "./merkle"
import { AsyncIMT, poseidon2 } from "../merkle-tree"
import type { IMTMerkleProof } from "../merkle-tree/async-imt"
import { computeMerkleProof } from ".."
export { cidv0ToHex, hexToCidv0 } from "./cid"

/**
 * Canonical height of the certificate merkle tree (in the Certificate Registry)
 */
export const CERTIFICATE_MERKLE_TREE_HEIGHT = 16 // Max leaves: 2^16 = 65536

/**
 * Canonical height of the revocation merkle tree (in the Certificate Registry)
 */
export const REVOCATION_MERKLE_TREE_HEIGHT = 14 // Max leaves: 2^14 = 16384

/**
 * Canonical height of the masterlist merkle tree (in the Certificate Registry)
 */
export const MASTERLIST_MERKLE_TREE_HEIGHT = 8 // Max leaves: 2^8 = 256

/**
 * Canonical merkle tree height for the circuit registry
 */
export const CIRCUIT_REGISTRY_HEIGHT = 12 // Max leaves: 2^12 = 4096

/**
 * Canonical zero leaf used to pad empty slots in every ordered Merkle tree maintained
 * by the registry (certificates, revocations, masterlists, circuits). The same value
 * is also hashed up the tree to derive the per-level zero values used as siblings for
 * missing children. Using this constant everywhere keeps roots reproducible: changing
 * it would change every canonical root.
 */
export const MERKLE_TREE_ZERO_VALUE = 0n

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
  const tree = new AsyncMerkleTree(CERTIFICATE_MERKLE_TREE_HEIGHT, 2)
  await tree.initialize(MERKLE_TREE_ZERO_VALUE, leaves)
  return tree
}

/**
 * Canonically generate a leaf hash for an intermediate certificate revocation.
 * The leaf is computed as `H(fingerprint, H(serial))` where:
 *  - `fingerprint` is the Poseidon2 fingerprint of the issuing CSCA
 *  - `serial` is the revoked DSC serial number, hex-encoded
 * @param rev Intermediate certificate revocation entry
 * @returns Leaf hash as a bigint
 */
export async function getRevocationLeafHash(
  rev: IntermediateCertificateRevocation,
): Promise<bigint> {
  assert(rev.fingerprint !== undefined, `Revocation fingerprint required`)
  assert(rev.serial !== undefined, `Revocation serial required`)
  assert(
    typeof rev.fingerprint === "string" && rev.fingerprint.startsWith("0x"),
    `Revocation fingerprint must be a 0x-prefixed hex string: ${rev.fingerprint}`,
  )
  assert(
    typeof rev.serial === "string" && rev.serial.startsWith("0x"),
    `Revocation serial must be a 0x-prefixed hex string: ${rev.serial}`,
  )
  const serialBytes = Binary.from(rev.serial).toUInt8Array()
  const serialHash = await poseidon2HashAsync(
    packBeBytesIntoFields(serialBytes, 31).map((hex) => BigInt(hex)),
  )
  return poseidon2HashAsync([BigInt(rev.fingerprint), serialHash])
}

/**
 * Canonically generate merkle tree leaf hashes from intermediate certificate revocations
 * @param revocations Array of intermediate certificate revocations
 * @returns Array of leaf hashes as bigints, sorted ascending
 */
export async function getRevocationLeafHashes(
  revocations: IntermediateCertificateRevocation[],
): Promise<bigint[]> {
  const leaves = await Promise.all(revocations.map((r) => getRevocationLeafHash(r)))
  leaves.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
  return leaves
}

/**
 * Canonically build a merkle tree from intermediate certificate revocations
 * @param revocations Array of intermediate certificate revocations
 * @returns AsyncMerkleTree
 */
export async function buildMerkleTreeFromRevocations(
  revocations: IntermediateCertificateRevocation[],
): Promise<AsyncMerkleTree> {
  const leaves = await getRevocationLeafHashes(revocations)
  const tree = new AsyncMerkleTree(REVOCATION_MERKLE_TREE_HEIGHT, 2)
  await tree.initialize(MERKLE_TREE_ZERO_VALUE, leaves)
  return tree
}

/**
 * Exclusion (non-membership) proof against an ordered Merkle tree.
 *
 * The ordered tree commits to a strictly ascending sequence of committed leaves packed
 * left-to-right starting at index 0; every slot beyond the committed range is the
 * canonical zero leaf (the same `zeroValue` the tree was initialised with). To prove
 * that `targetLeaf` is NOT in the tree, the prover supplies inclusion proofs for the
 * two adjacent leaves that bracket the target:
 *
 *   `lowerProof.leaf < targetLeaf < upperProof.leaf`
 *   `upperProof.leafIndex - lowerProof.leafIndex === 1`
 *
 * Boundary cases are encoded as follows so that verification needs no out-of-band
 * knowledge of the total committed leaf count:
 *
 *  - `lowerProof === null`: `targetLeaf` sorts before every committed leaf.
 *    The verifier requires `upperProof.leafIndex === 0`, `upperProof.leaf !== 0`
 *    (otherwise the tree is empty and the bound is degenerate), and
 *    `targetLeaf < upperProof.leaf`.
 *
 *  - `upperProof.leaf === 0n`: `targetLeaf` sorts after every committed leaf.
 *    The verifier requires `upperProof.leafIndex === lowerProof.leafIndex + 1`
 *    (consecutive) and `lowerProof.leaf < targetLeaf`. Under the canonical
 *    left-to-right packing invariant, an empty slot at index `k+1` implies all
 *    slots `> k` are empty, so no committed leaf can equal `targetLeaf`.
 *
 * Soundness assumes the verified `root` belongs to a canonically-built ordered tree
 * (no zero gaps among committed leaves). `buildMerkleTreeFromRevocations` enforces
 * this by construction.
 */
export type OrderedMerkleExclusionProof = {
  /** Ordered Merkle tree root the exclusion is proven against (0x-prefixed 32-byte hex). */
  root: string
  /** Target leaf hash asserted to be absent from the tree. */
  targetLeaf: bigint
  /** Inclusion proof for the largest leaf strictly less than `targetLeaf`, or `null`
   * when `targetLeaf` sorts before every committed leaf. */
  lowerProof: IMTMerkleProof | null
  /** Inclusion proof for the leaf immediately after `lowerProof`. Either the smallest
   * committed leaf strictly greater than `targetLeaf` (interior case), or the canonical
   * zero leaf at the next padding slot (after-the-end case). When `lowerProof` is `null`,
   * this is the inclusion proof at index 0. Always present. */
  upperProof: IMTMerkleProof
}

/**
 * Build an {@link OrderedMerkleExclusionProof} for the canonical revocation tree.
 *
 * Returns `null` when `targetLeaf` is already a committed member — in an ordered tree
 * there is no strict bracket `lower < target < upper` around a value that equals one
 * of the leaves.
 *
 * Internally the IMT is initialised with one trailing sentinel zero leaf so that
 * `createProof` works at index `N` for the after-the-end case. Appending an explicit
 * zero at the first padding slot does not change any internal hash and therefore does
 * not change the canonical `root` (which is identical to `buildMerkleTreeFromRevocations`).
 */
export async function buildRevocationExclusionProof(
  sortedLeaves: bigint[],
  targetLeaf: bigint,
): Promise<OrderedMerkleExclusionProof | null> {
  // The construction relies on (a) strictly ascending committed leaves and
  // (b) at least one free slot for the trailing zero sentinel.
  for (let i = 1; i < sortedLeaves.length; i++) {
    assert(
      sortedLeaves[i - 1] < sortedLeaves[i],
      `sortedLeaves must be strictly ascending; violation at index ${i}`,
    )
  }
  assert(
    sortedLeaves.length < 2 ** REVOCATION_MERKLE_TREE_HEIGHT,
    `tree is full; cannot append zero sentinel for after-the-end exclusion proofs`,
  )
  // Membership ⇒ no exclusion proof can exist in an ordered tree.
  if (sortedLeaves.includes(targetLeaf)) return null

  const imt = new AsyncIMT(poseidon2, REVOCATION_MERKLE_TREE_HEIGHT, 2)
  await imt.initialize(MERKLE_TREE_ZERO_VALUE, [...sortedLeaves, MERKLE_TREE_ZERO_VALUE])
  const root = `0x${(imt.root as bigint).toString(16).padStart(64, "0")}`
  const upperIdx = sortedLeaves.findIndex((l) => l > targetLeaf)

  if (upperIdx === -1) {
    // After the last committed leaf: lower at N-1, upper at N (zero sentinel).
    return {
      root,
      targetLeaf,
      lowerProof: imt.createProof(sortedLeaves.length - 1),
      upperProof: imt.createProof(sortedLeaves.length),
    }
  }
  if (upperIdx === 0) {
    // Before the first committed leaf: only upper, anchored at index 0.
    return {
      root,
      targetLeaf,
      lowerProof: null,
      upperProof: imt.createProof(0),
    }
  }
  // Interior bracket.
  return {
    root,
    targetLeaf,
    lowerProof: imt.createProof(upperIdx - 1),
    upperProof: imt.createProof(upperIdx),
  }
}

/**
 * Verify an {@link OrderedMerkleExclusionProof} against the canonical revocation tree.
 *
 * Returns `true` iff every required structural and ordering constraint holds:
 *  - `upperProof` is present, verifies (Poseidon2), and its root matches `proof.root`.
 *  - When `lowerProof === null` (left boundary):
 *      `upperProof.leafIndex === 0`,
 *      `upperProof.leaf !== 0n` (tree must have at least one committed leaf),
 *      `upperProof.leaf > targetLeaf`.
 *  - When `lowerProof !== null`:
 *      `lowerProof` verifies, root matches,
 *      `lowerProof.leaf !== 0n` (must be a real committed leaf, not zero padding),
 *      `lowerProof.leaf < targetLeaf`,
 *      `upperProof.leafIndex - lowerProof.leafIndex === 1`,
 *      AND either `upperProof.leaf > targetLeaf` (interior case) or
 *      `upperProof.leaf === 0n` (after-the-end case; canonical zero padding).
 *
 * Soundness assumes `proof.root` came from a canonically-built ordered tree.
 */
export async function verifyRevocationExclusionProof(
  proof: OrderedMerkleExclusionProof,
): Promise<boolean> {
  const { root, targetLeaf, lowerProof, upperProof } = proof

  const proofRootMatches = (p: IMTMerkleProof) =>
    `0x${(p.root as bigint).toString(16).padStart(64, "0")}` === root

  // Upper is always required.
  if (!proofRootMatches(upperProof)) return false
  if (!(await AsyncIMT.verifyProof(upperProof, poseidon2))) return false
  const upperLeaf = upperProof.leaf as bigint

  if (lowerProof === null) {
    // Left boundary: upper anchored at index 0 with target < upper.leaf.
    if (upperProof.leafIndex !== 0) return false
    if (upperLeaf === MERKLE_TREE_ZERO_VALUE) return false // empty tree ⇒ degenerate
    return upperLeaf > targetLeaf
  }

  // Both proofs supplied. Lower must verify, share the root, and be a real
  // (non-zero) committed leaf strictly less than the target.
  if (!proofRootMatches(lowerProof)) return false
  if (!(await AsyncIMT.verifyProof(lowerProof, poseidon2))) return false
  const lowerLeaf = lowerProof.leaf as bigint
  if (lowerLeaf === MERKLE_TREE_ZERO_VALUE) return false
  if (!(lowerLeaf < targetLeaf)) return false

  // Lower and upper must be at consecutive slots.
  if (upperProof.leafIndex - lowerProof.leafIndex !== 1) return false

  // Either the interior case (strict upper bound) or the after-the-end case
  // (next slot is the canonical zero padding).
  if (upperLeaf === MERKLE_TREE_ZERO_VALUE) return true
  return upperLeaf > targetLeaf
}

/**
 * Canonically build a merkle tree from masterlist file hashes.
 * Each masterlist entry is a Poseidon2 hash.
 * @param masterlists Array of masterlist file hashes (as hex strings or bigint-compatible strings)
 * @returns AsyncMerkleTree
 */
export async function buildMerkleTreeFromMasterlists(
  masterlists: string[],
): Promise<AsyncMerkleTree> {
  const leaves = masterlists.map((h) => BigInt(h))
  leaves.sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
  const tree = new AsyncMerkleTree(MASTERLIST_MERKLE_TREE_HEIGHT, 2)
  await tree.initialize(MERKLE_TREE_ZERO_VALUE, leaves)
  return tree
}

/**
 * Combine the certificate, revocation, and masterlist Merkle roots into the canonical
 * version 1 certificate root, cryptographically bound to the schema version and timestamp:
 *
 *   certificate_root = H(packed(schema_version | timestamp), state_root)
 *   state_root       = H(certificate_merkle_root, revocation_merkle_root, masterlist_merkle_root)
 *
 * `schema_version` is encoded as 2 big-endian bytes and `timestamp` as 4 big-endian bytes,
 * concatenated and packed into a single 31-byte field. H is Poseidon2.
 *
 * @returns Certificate root as a 0x-prefixed 32-byte hex string
 */
async function combineCertificateRootV1(args: {
  certificateRoot: string
  revocationRoot: string
  masterlistRoot: string
  schemaVersion: number
  timestamp: number
}): Promise<string> {
  const { certificateRoot, revocationRoot, masterlistRoot, schemaVersion, timestamp } = args
  assert(
    schemaVersion >= 0 && schemaVersion <= 0xffff,
    `Schema version must fit in 2 bytes: ${schemaVersion}`,
  )
  assert(timestamp >= 0 && timestamp <= 0xffffffff, `Timestamp must fit in 4 bytes: ${timestamp}`)

  const stateRoot = await poseidon2HashAsync([
    BigInt(certificateRoot),
    BigInt(revocationRoot),
    BigInt(masterlistRoot),
  ])

  const meta = new Uint8Array([
    (schemaVersion >> 8) & 0xff,
    schemaVersion & 0xff,
    (timestamp >> 24) & 0xff,
    (timestamp >> 16) & 0xff,
    (timestamp >> 8) & 0xff,
    timestamp & 0xff,
  ])
  const packedMeta = BigInt(packBeBytesIntoFields(meta, 31)[0])

  const root = await poseidon2HashAsync([packedMeta, stateRoot])
  return `0x${root.toString(16).padStart(64, "0")}`
}

/**
 * Calculate the canonical certificate root from a packaged certificates file.
 *
 * Version 0 (legacy): the certificate root is simply the certificate merkle tree root.
 * Revocations and masterlists are not part of the v0 schema. Returned as-is for backward
 * compatibility with previously published v0 root files.
 *
 * Version 1: the composite root (state_root) binds the certificate, revocation, and masterlist
 * merkle trees together with the schema version and timestamp. See `combineCertificateRootV1`.
 *   certificate_root = H(packed(schema_version | timestamp), state_root)
 *   state_root       = H(certificate_merkle_root, revocation_merkle_root, masterlist_merkle_root)
 * `schema_version` is encoded as 2 big-endian bytes and `timestamp` as 4 big-endian bytes,
 * concatenated and packed into a single 31-byte field. H is Poseidon2.
 *
 * If `version` is not set on the input it defaults to 0.
 *
 * @param packagedCerts Packaged certificates file
 * @returns Certificate root used in the Certificate Registry, as a 0x-prefixed 32-byte hex string
 */
export async function calculatePackagedCertificatesRoot(
  packagedCerts: PackagedCertificatesFile,
): Promise<string> {
  // Default to v0 if `version` is not set on the input.
  const schemaVersion = packagedCerts.version ?? 0
  const certTree = await buildMerkleTreeFromCerts(packagedCerts.certificates, schemaVersion)

  // Version 0: certificate root is just the certificate Merkle tree root (legacy behaviour).
  // Revocations and masterlists are not part of the v0 schema.
  if (schemaVersion === 0) {
    return certTree.root
  } else if (schemaVersion === 1) {
    const v1 = packagedCerts as PackagedCertificatesFileV1
    const revTree = await buildMerkleTreeFromRevocations(v1.revocations ?? [])
    const mlTree = await buildMerkleTreeFromMasterlists(v1.masterlists ?? [])
    return combineCertificateRootV1({
      certificateRoot: certTree.root,
      revocationRoot: revTree.root,
      masterlistRoot: mlTree.root,
      schemaVersion,
      timestamp: v1.timestamp,
    })
  } else {
    throw new Error(`Unsupported Packaged Certificates schema version: ${schemaVersion}`)
  }
}

/**
 * Input for {@link createPackagedCertificatesFile}.
 */
export type CreatePackagedCertificatesFileInput = {
  // Timestamp when the package was created and the certificates were validated (Unix seconds)
  timestamp: number
  // Certificates to include in the certificate Merkle tree
  certificates: PackagedCertificate[]
  // Masterlist file hashes (Poseidon2 hashes of the upstream masterlist files)
  masterlists: string[]
  // Intermediate (DSC) certificate revocations. Defaults to `[]` when omitted.
  revocations?: IntermediateCertificateRevocation[]
  // Previous root hash, if any (used for chaining published roots)
  previous_root?: string
  // Environment label (omit for production)
  environment?: string
}

/**
 * Factory that produces a fully-formed {@link PackagedCertificatesFileV1} from the inputs
 * required to build it.
 *
 * The factory builds the certificate, revocation, and masterlist Merkle trees exactly once and
 * reuses them both to compute the canonical `root` and to populate `certificates_serialised`
 * and `revocations_serialised`. This guarantees the returned file is internally consistent by
 * construction (i.e. `calculatePackagedCertificatesRoot(file) === file.root`).
 *
 * @param input Inputs required to build the file. See {@link CreatePackagedCertificatesFileInput}.
 * @returns A fully-formed v1 packaged certificates file.
 */
export async function createPackagedCertificatesFile(
  input: CreatePackagedCertificatesFileInput,
): Promise<PackagedCertificatesFileV1> {
  assert(Array.isArray(input.certificates), "certificates must be an array")
  assert(Array.isArray(input.masterlists), "masterlists must be an array")
  assert(
    input.revocations === undefined || Array.isArray(input.revocations),
    "revocations must be an array when provided",
  )
  assert(
    input.timestamp >= 0 && input.timestamp <= 0xffffffff,
    `Timestamp must fit in 4 bytes: ${input.timestamp}`,
  )

  const schemaVersion = 1
  const revocations = input.revocations ?? []

  const certTree = await buildMerkleTreeFromCerts(input.certificates, schemaVersion)
  const revTree = await buildMerkleTreeFromRevocations(revocations)
  const mlTree = await buildMerkleTreeFromMasterlists(input.masterlists)

  const root = await combineCertificateRootV1({
    certificateRoot: certTree.root,
    revocationRoot: revTree.root,
    masterlistRoot: mlTree.root,
    schemaVersion,
    timestamp: input.timestamp,
  })

  const file: PackagedCertificatesFileV1 = {
    version: 1,
    timestamp: input.timestamp,
    root,
    certificates: input.certificates,
    certificates_serialised: certTree.serialize(),
    revocations,
    revocations_serialised: revTree.serialize(),
    masterlists: input.masterlists,
  }
  if (input.previous_root !== undefined) file.previous_root = input.previous_root
  if (input.environment !== undefined) file.environment = input.environment
  return file
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
