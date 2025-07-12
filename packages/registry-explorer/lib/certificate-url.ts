/**
 * Certificate URL template constants and utilities
 */

/**
 * Packaged certificates URLs
 */
export const PACKAGED_CERTIFICATES_URL_MAINNET = "https://certificates.zkpassport.id/mainnet"
export const PACKAGED_CERTIFICATES_URL_SEPOLIA = "https://certificates.zkpassport.id/sepolia"
export const PACKAGED_CERTIFICATES_URL_DEV = "http://localhost:3000/certificates"

/**
 * Default chain ID for certificate URLs (Sepolia testnet)
 */
export const DEFAULT_CHAIN_ID = 11155111

/**
 * Normalize hash to ensure consistent format
 */
function normalizeHash(hash: string): string {
  return hash.startsWith("0x") ? hash : `0x${hash}`
}

/**
 * Packaged certificates URL generator
 * @param root - The certificates root hash
 * @param chainId - The chain ID (defaults to Sepolia)
 * @returns The full URL for the packaged certificates
 */
export function getCertificateUrl(root: string, chainId: number = DEFAULT_CHAIN_ID): string {
  const normalizedRoot = normalizeHash(root)

  if (chainId === 1) {
    return `${PACKAGED_CERTIFICATES_URL_MAINNET}/${normalizedRoot}.json`
  } else if (chainId === 11155111) {
    return `${PACKAGED_CERTIFICATES_URL_SEPOLIA}/${normalizedRoot}.json`
  } else {
    return `${PACKAGED_CERTIFICATES_URL_DEV}/${normalizedRoot}.json`
  }
}

/**
 * Get the chain ID from environment variables
 */
export function getChainId(): number {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? DEFAULT_CHAIN_ID)
}
