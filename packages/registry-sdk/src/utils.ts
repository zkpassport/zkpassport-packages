/**
 * Strip the 0x prefix from a string if present
 * @param str - The string to strip the 0x prefix from
 * @returns The string without the 0x prefix
 */
export function strip0x(str: string) {
  return str.startsWith("0x") ? str.slice(2) : str
}

/**
 * Normalise a hash to a 64 character lowercase hex string
 * @param hash - The hash to normalise
 * @returns The normalised hash
 */
export function normaliseHash(hash: string | bigint): string {
  if (typeof hash === "bigint") {
    return `0x${hash.toString(16).toLowerCase().padStart(64, "0")}`
  }
  return `0x${strip0x(hash).toLowerCase().padStart(64, "0")}`
}
