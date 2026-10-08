/**
 * Cross-platform random bytes implementation that works in both Node.js and browser environments
 */

const cryptoPolyfill =
  typeof window !== "undefined"
    ? {
        // Simplified implementations for browser
        getRandomValues: (buffer: Uint8Array): Uint8Array => {
          return window.crypto.getRandomValues(buffer)
        },
      }
    : globalThis.crypto

// For modern environments, we'll use the Web Crypto API
// Both browsers and recent Node.js versions support this API
const cryptoAPI =
  typeof window !== "undefined"
    ? window.crypto
    : typeof globalThis !== "undefined" && globalThis.crypto
      ? globalThis.crypto
      : cryptoPolyfill

/**
 * Generate cryptographically secure random bytes
 * Works in both Node.js and browser environments
 *
 * @param length Number of bytes to generate
 * @returns Uint8Array of random bytes
 */
export function getRandomBytes(length: number): Uint8Array {
  const randomValues = new Uint8Array(length)

  // Use Web Crypto API getRandomValues
  if (cryptoAPI && typeof cryptoAPI.getRandomValues === "function") {
    cryptoAPI.getRandomValues(randomValues)
    return randomValues
  }

  // Fallback for non-secure environments (should not happen in production)
  throw new Error(
    "No secure random number generator available in this environment. Make sure you're in a secure context that provides crypto APIs."
  )
}
