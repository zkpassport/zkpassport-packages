/**
 * Certificate Registry ID
 * Used to identify the certificate registry in the root registry
 */
export const CERTIFICATE_REGISTRY_ID = 1

/**
 * Default packaged certificates URLs
 */
export const PACKAGED_CERTIFICATES_URL_MAINNET = "https://certificates.zkpassport.id/packaged"
export const PACKAGED_CERTIFICATES_URL_SEPOLIA = "http://localhost:3000/certificates"
export const PACKAGED_CERTIFICATES_URL_DEV = "http://localhost:3000/certificates"

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
