/**
 * Certificate Registry ID
 * Used to identify the certificate registry in the root registry
 */
export const CERTIFICATE_REGISTRY_ID = 1

/**
 * Packaged certificates URLs
 */
export const PACKAGED_CERTIFICATES_URL_MAINNET = "https://certificates.zkpassport.id/mainnet"
export const PACKAGED_CERTIFICATES_URL_SEPOLIA = "https://certificates.zkpassport.id/sepolia"
export const PACKAGED_CERTIFICATES_URL_DEV = "http://localhost:3000/certificates"

/**
 * Packaged certificates URL generator
 * @param chainId - The chain ID
 * @param root - The certificates root hash
 * @param cid - The CID of the packaged certificates (optional)
 */
export const PACKAGED_CERTIFICATES_URL_TEMPLATE = (chainId: number, root: string, cid?: string) => {
  if (cid) {
    return `https://ipfs.infura.io/ipfs/${cid}`
  }
  if (chainId === 1) {
    return `${PACKAGED_CERTIFICATES_URL_MAINNET}/${root}.json`
  } else if (chainId === 11155111) {
    return `${PACKAGED_CERTIFICATES_URL_SEPOLIA}/${root}.json`
  } else {
    return `${PACKAGED_CERTIFICATES_URL_DEV}/${root}.json`
  }
}

/**
 * Default page size for historical roots results
 */
export const DEFAULT_HISTORICAL_ROOTS_PAGE_SIZE = 100

/**
 * Function signature for latestRoot()
 */
export const LATEST_ROOT_SIGNATURE = "0xd7b0fef1"

/**
 * Function signature for latestRoot(bytes32)
 */
export const LATEST_ROOT_WITH_PARAM_SIGNATURE = "0xc3bc16e8"

/**
 * Function signature for getHistoricalRoots(bytes32,uint256,uint256)
 */
export const GET_HISTORICAL_ROOTS_SIGNATURE = "0x06ac4103"

/**
 * Function signature for getLatestRootDetails(bytes32)
 */
export const GET_LATEST_ROOT_DETAILS_SIGNATURE = "0x76785af8"
