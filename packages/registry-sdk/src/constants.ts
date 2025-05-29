import { normaliseHash } from "./utils"

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
  root = normaliseHash(root)
  if (chainId === 1) {
    return `${PACKAGED_CERTIFICATES_URL_MAINNET}/${root}.json`
  } else if (chainId === 11155111) {
    return `${PACKAGED_CERTIFICATES_URL_SEPOLIA}/${root}.json`
  } else {
    return `${PACKAGED_CERTIFICATES_URL_DEV}/${root}.json`
  }
}

/**
 * Circuit URLs
 */
export const CIRCUIT_URL_MAINNET = "https://circuits2.zkpassport.id/mainnet"
export const CIRCUIT_URL_SEPOLIA = "https://circuits2.zkpassport.id/sepolia"
export const CIRCUIT_URL_DEV = "http://localhost:3000"

/**
 * Circuit manifest URL generator
 * @param chainId - The chain ID
 * @param root - The circuit manifest root hash
 * @param version - The circuit manifest version
 * @param cid - The CID of the circuit manifest (optional)
 */
export const CIRCUIT_MANIFEST_URL_TEMPLATE = (
  chainId: number,
  { root, version, cid }: { root?: string; version?: string; cid?: string },
) => {
  if (root) {
    root = normaliseHash(root)
    if (chainId === 1) {
      return `${CIRCUIT_URL_MAINNET}/by-root/${root}/manifest.json`
    } else if (chainId === 11155111) {
      return `${CIRCUIT_URL_SEPOLIA}/by-root/${root}/manifest.json`
    } else {
      return `${CIRCUIT_URL_DEV}/by-root/${root}/manifest.json`
    }
  } else if (version) {
    if (chainId === 1) {
      return `${CIRCUIT_URL_MAINNET}/by-version/${version}/manifest.json`
    } else if (chainId === 11155111) {
      return `${CIRCUIT_URL_SEPOLIA}/by-version/${version}/manifest.json`
    } else {
      return `${CIRCUIT_URL_DEV}/by-version/${version}/manifest.json`
    }
  } else if (cid) {
    return `https://ipfs.infura.io/ipfs/${cid}`
  } else {
    throw new Error("No root, version or cid provided")
  }
}

/**
 * Packaged circuit URL generator
 * @param chainId - The chain ID
 * @param hash - The circuit vkey hash
 * @param cid - The CID of the packaged circuit (optional)
 */
export const PACKAGED_CIRCUIT_URL_TEMPLATE = (chainId: number, hash: string, cid?: string) => {
  if (cid) {
    return `https://ipfs.infura.io/ipfs/${cid}`
  }
  hash = normaliseHash(hash)
  if (chainId === 1) {
    return `${CIRCUIT_URL_MAINNET}/by-hash/${hash}.json`
  } else if (chainId === 11155111) {
    return `${CIRCUIT_URL_SEPOLIA}/by-hash/${hash}.json`
  } else {
    return `${CIRCUIT_URL_DEV}/by-hash/${hash}.json`
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
 * Function signature for getHistoricalRootsByHash(bytes32,bytes32,uint256)
 */
export const GET_HISTORICAL_ROOTS_BY_HASH_SIGNATURE = "0xcb0c82c7"

/**
 * Function signature for getLatestRootDetails(bytes32)
 */
export const GET_LATEST_ROOT_DETAILS_SIGNATURE = "0x76785af8"

/**
 * Function signature for registries(bytes32)
 */
export const REGISTRIES_MAPPING_SIGNATURE = "0x5d8d57a6"

/**
 * Function signature for getRootDetailsByRoot(bytes32,bytes32)
 */
export const GET_ROOT_DETAILS_BY_ROOT_SIGNATURE = "0xbb3dd539"

/**
 * Function signature for isRootValid(bytes32,bytes32)
 */
export const IS_ROOT_VALID_SIGNATURE = "0x83578c11"
