import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { Binary } from "../binary"
import { ECPublicKey, PackagedCertificate, RSAPublicKey } from "../types"
import { assert, packBeBytesIntoFields } from "../utils"
import { AsyncMerkleTree } from "./merkle"
export { hexToCid, cidToHex } from "./cid"

/**
 * Canonical merkle tree height for the certificate registry
 */
export const CERTIFICATE_REGISTRY_HEIGHT = 16

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
export const PACKAGED_CERTIFICATE_TAGS = ["ICAO", "DE", "NL", "IT", "ES"]

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
    return new Uint8Array(Binary.from(publicKey.modulus))
  } else if (publicKey.type === "EC") {
    return new Uint8Array(
      Binary.from(publicKey.public_key_x).concat(Binary.from(publicKey.public_key_y)),
    )
  } else {
    throw new Error("Unsupported signature algorithm")
  }
}

/**
 * Canonically generate a leaf hash from a packaged certificate using Poseidon2
 * @param cert Packaged certificate to generate a leaf hash for
 * @param options Optional options for the leaf hash
 * @returns Leaf hash as a hex string
 */
export async function getCertificateLeafHash(
  cert: PackagedCertificate,
  options?: { tags?: string[]; type?: number; hashAlgId?: number },
): Promise<string> {
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
  const publicKeyBytes = new Uint8Array(Array.from(publicKeyToBytes(cert.public_key)))
  // Return the canonical leaf hash of the certificate
  return Binary.from(
    await poseidon2HashAsync([
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
    ]),
  ).toHex()
}

/**
 * Canonically generate merkle tree leaf hashes from certificates
 */
export async function getCertificateLeafHashes(certs: PackagedCertificate[]): Promise<bigint[]> {
  return Promise.all(certs.map(async (cert) => BigInt(await getCertificateLeafHash(cert))))
}

/**
 * Canonically build a merkle tree from certificates
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
 * Calculate the canonical root hash of packaged certificates
 */
export async function getRootOfPackagedCertificates(certs: PackagedCertificate[]): Promise<string> {
  const leaves = await getCertificateLeafHashes(certs)
  const tree = new AsyncMerkleTree(CERTIFICATE_REGISTRY_HEIGHT, 2)
  await tree.initialize(0n, leaves)
  return tree.root
}
