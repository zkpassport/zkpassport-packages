/**
 * CIDv1 conversion utilities
 *
 * These functions convert between IPFS CIDv1 strings (base32) and hexadecimal strings.
 * They handle the basic encoding/decoding without external dependencies.
 */

/**
 * Base32 character set used in CIDv1 (RFC4648)
 */
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"

/**
 * Converts an IPFS CIDv1 string to a hexadecimal string
 */
export function cidToHex(cid: string): string {
  // Validate CID format (basic check)
  if (!cid.startsWith("bafkr")) {
    throw new Error('Invalid CID format: expected a CIDv1 starting with "bafkr"')
  }
  // Remove the 'bafkr' prefix for processing
  const base32Content = cid.substring(5)
  // Convert from base32 to binary
  let bits = ""
  for (const char of base32Content) {
    const value = BASE32_ALPHABET.indexOf(char.toLowerCase())
    if (value === -1) {
      throw new Error(`Invalid base32 character: ${char}`)
    }
    bits += value.toString(2).padStart(5, "0")
  }
  // Convert binary to hex
  let hex = ""
  for (let i = 0; i < bits.length; i += 4) {
    if (i + 4 <= bits.length) {
      const chunk = bits.substring(i, i + 4)
      hex += parseInt(chunk, 2).toString(16)
    }
  }
  return "0x" + hex.slice(3) // Remove the first 3 characters (0x220)
}

/**
 * Converts a hexadecimal string to an IPFS CIDv1 string
 */
export function hexToCid(hex: string): string {
  // Validate and normalize hex string
  if (!hex.match(/^(0x)?[0-9a-fA-F]+$/)) {
    throw new Error("Invalid hex string format")
  }
  // Remove '0x' prefix if present
  hex = hex.startsWith("0x") ? hex.substring(2) : hex
  // Add leading 220 to the hex string
  hex = "220" + hex
  // Convert hex to binary
  let bits = ""
  for (const char of hex) {
    const value = parseInt(char, 16)
    bits += value.toString(2).padStart(4, "0")
  }
  // Convert binary to base32
  let base32 = ""
  for (let i = 0; i < bits.length; i += 5) {
    if (i + 5 <= bits.length) {
      const chunk = bits.substring(i, i + 5)
      const value = parseInt(chunk, 2)
      base32 += BASE32_ALPHABET[value]
    } else {
      // Handle partial chunks at the end by padding with zeros
      const chunk = bits.substring(i).padEnd(5, "0")
      const value = parseInt(chunk, 2)
      base32 += BASE32_ALPHABET[value]
    }
  }
  // Add the CIDv1 prefix
  return "bafkr" + base32
}
