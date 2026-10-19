import { getRandomBytes } from "./crypto"

/**
 * Parse an origin header and return just the scheme and host (excluding port)
 * @param origin The origin string to parse
 * @returns The parsed origin or the original string if parsing fails
 */
export function parseOriginHeader(origin: string): string | undefined {
  try {
    const parsed = new URL(origin)
    return `${parsed.protocol}//${parsed.host.split(":")[0]}`
  } catch {
    return origin
  }
}

/**
 * Generate a random hex ID
 * @param bytes The number of random bytes to generate (default: 16)
 * @returns A hex string of random bytes
 */
export function generateRandomId(bytes: number = 16): string {
  const randomBytes = getRandomBytes(bytes)
  return Buffer.from(randomBytes).toString("hex")
}
