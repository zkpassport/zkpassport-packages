/**
 * CIDv0 conversion utilities
 *
 * These functions convert between IPFS CIDv0 strings (base58btc) and hexadecimal strings.
 * They handle the basic encoding/decoding without external dependencies.
 *
 * CIDv0 is always:
 * - base58btc encoded
 * - using dag-pb codec
 * - multihash with sha2-256
 */

/**
 * Base58 character set used in CIDv0
 */
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

/**
 * Expected length of a CIDv0 buffer: 2 bytes for multihash prefix + 32 bytes for digest
 */
const CIDV0_BUFFER_LENGTH = 34

/**
 * SHA-256 multihash prefix (0x12 = sha2-256, 0x20 = 32 bytes length)
 */
const SHA256_MULTIHASH_PREFIX = [0x12, 0x20]

/**
 * Converts a base58btc string to a Buffer
 * @param base58 - Base58btc encoded string
 * @returns Uint8Array representation of the data
 * @throws Error if input contains invalid base58 characters
 */
function base58ToBuffer(base58: string): Uint8Array {
  if (!base58 || typeof base58 !== "string") {
    throw new Error("Input must be a non-empty string")
  }
  // A CIDv0 hash is 34 bytes - 2 bytes prefix + 32 bytes digest
  const result = new Uint8Array(CIDV0_BUFFER_LENGTH)
  // Convert from base58 to integer
  let n = BigInt(0)
  for (let i = 0; i < base58.length; i++) {
    const char = base58[i]
    const value = BASE58_ALPHABET.indexOf(char)
    if (value === -1) {
      throw new Error(`Invalid base58 character: ${char}`)
    }
    n = n * BigInt(58) + BigInt(value)
  }
  // Convert to bytes in big-endian, filling from the right
  for (let i = result.length - 1; n > 0n && i >= 0; i--) {
    result[i] = Number(n & BigInt(0xff))
    n = n >> BigInt(8)
  }
  // Handle leading zeros (encoded as '1' in base58)
  let leadingZeros = 0
  for (let j = 0; j < base58.length && base58[j] === "1"; j++) {
    leadingZeros++
  }
  // Set leading zeros in the result
  for (let j = 0; j < leadingZeros && j < result.length; j++) {
    result[j] = 0
  }
  return result
}

/**
 * Converts a Buffer to a base58btc string
 * @param buffer - Uint8Array to encode to base58btc
 * @returns Base58btc encoded string
 * @throws Error if input is not a Uint8Array
 */
function bufferToBase58(buffer: Uint8Array): string {
  if (!(buffer instanceof Uint8Array)) throw new Error("Input must be a Uint8Array")
  if (buffer.length === 0) return ""
  // Count leading zeros
  let zeros = 0
  while (zeros < buffer.length && buffer[zeros] === 0) {
    zeros++
  }
  // Convert to a big integer
  let n = BigInt(0)
  for (let i = zeros; i < buffer.length; i++) {
    n = n * BigInt(256) + BigInt(buffer[i])
  }
  // Convert to base58
  let base58 = ""
  while (n > 0n) {
    const remainder = Number(n % BigInt(58))
    base58 = BASE58_ALPHABET[remainder] + base58
    n = n / BigInt(58)
  }
  // Add leading '1's for each leading zero byte
  const ones = "1".repeat(zeros)
  return ones + base58
}

/**
 * Converts an IPFS CIDv0 string to a hexadecimal string
 * @param cid - CIDv0 string starting with "Qm"
 * @returns Hexadecimal string representation of the multihash digest
 * @throws Error if input is not a valid CIDv0
 */
export function cidv0ToHex(cid: string): string {
  if (!cid || typeof cid !== "string") {
    throw new Error("CID must be a non-empty string")
  }
  // Validate CID format (basic check)
  if (!cid.startsWith("Qm")) {
    throw new Error('Invalid CID format: expected a CIDv0 starting with "Qm"')
  }
  // Decode the base58btc string to bytes
  const bytes = base58ToBuffer(cid)
  // Verify this has the expected sha2-256 multihash prefix
  if (
    bytes.length < 2 ||
    bytes[0] !== SHA256_MULTIHASH_PREFIX[0] ||
    bytes[1] !== SHA256_MULTIHASH_PREFIX[1]
  ) {
    throw new Error("Invalid CIDv0: missing or incorrect sha2-256 multihash prefix")
  }
  // Convert to hex - skip the first two bytes (multihash prefix)
  let hex = "0x"
  for (let i = 2; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0").toUpperCase()
  }
  return hex
}

/**
 * Converts a hexadecimal string to an IPFS CIDv0 string
 *
 * @param hex - Hexadecimal string (with or without 0x prefix)
 * @returns CIDv0 string
 * @throws Error if input is not a valid hex string
 */
export function hexToCidv0(hex: string): string {
  if (!hex || typeof hex !== "string") {
    throw new Error("Input must be a non-empty hex string")
  }
  // Validate and normalize hex string
  if (!hex.match(/^(0x)?[0-9a-fA-F]+$/i)) throw new Error("Invalid hex string format")
  // Remove '0x' prefix if present
  hex = hex.startsWith("0x") ? hex.substring(2) : hex
  // Check that we have a valid length for a 32-byte digest
  if (hex.length > 64) {
    hex = hex.substring(hex.length - 64) // Take the last 64 characters
  } else if (hex.length < 64) {
    hex = hex.padStart(64, "0") // Pad with leading zeros if too short
  }
  // Create a new buffer with the multihash prefix for sha2-256 (0x1220)
  const bytes = new Uint8Array(CIDV0_BUFFER_LENGTH)
  // Set the multihash prefix
  bytes[0] = SHA256_MULTIHASH_PREFIX[0] // sha2-256 identifier
  bytes[1] = SHA256_MULTIHASH_PREFIX[1] // length (32 bytes)

  // Fill with the hash from hex
  for (let i = 0; i < hex.length; i += 2) {
    const byteValue = parseInt(hex.substring(i, i + 2), 16)
    bytes[2 + i / 2] = byteValue
  }
  // Convert to base58btc
  return bufferToBase58(bytes)
}
