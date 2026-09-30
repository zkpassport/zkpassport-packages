import { getIdFromChain } from "@zkpassport/utils"
import type { SupportedChain } from "@zkpassport/utils/types"
import { normaliseHash } from "./utils"

/**
 * Default number of retries for fetching data
 */
export const DEFAULT_RETRY_COUNT = 3

/**
 * Certificate Registry ID
 * Used to identify the certificate registry in the root registry
 */
export const CERTIFICATE_REGISTRY_ID = 1

/**
 * Packaged certificates URLs
 */
export const PACKAGED_CERTIFICATES_URL_MAINNET = "https://certificates.zkpassport.id/mainnet"
export const PACKAGED_CERTIFICATES_URL_TESTNET = "https://certificates.zkpassport.id/testnet"
export const PACKAGED_CERTIFICATES_URL_DEV = "http://localhost:8000/root"

/**
 * Packaged certificates URL generator
 * @param chainId - The chain ID
 * @param root - The certificates root hash
 * @param cid - The CID of the packaged certificates (optional)
 */
export const PACKAGED_CERTIFICATES_URL_TEMPLATE = (chainId: number, root: string, cid?: string) => {
  if (cid) {
    return `https://ipfs.zkpassport.id/ipfs/${cid}`
  }
  root = normaliseHash(root)
  return `${getNetworkConstants(chainId).packagedCertificatesUrl}/${root}.json`
}

/**
 * Circuit URLs
 */
export const CIRCUIT_URL_MAINNET = "https://circuits2.zkpassport.id/mainnet"
export const CIRCUIT_URL_SEPOLIA = "https://circuits2.zkpassport.id/testnet"
export const CIRCUIT_URL_DEV = "http://localhost:8000"

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
    return `${getNetworkConstants(chainId).circuitUrl}/by-root/${root}/manifest.json`
  } else if (version) {
    return `${getNetworkConstants(chainId).circuitUrl}/by-version/${version}/manifest.json`
  } else if (cid) {
    return `https://ipfs.zkpassport.id/ipfs/${cid}`
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
    return `https://ipfs.zkpassport.id/ipfs/${cid}`
  }
  hash = normaliseHash(hash)
  return `${getNetworkConstants(chainId).circuitUrl}/by-hash/${hash}.json`
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
 * Function signature for isRootValid(bytes32,bytes32,uint256)
 */
export const IS_ROOT_VALID_SIGNATURE = "0x2aae4296"

type NetworkType = "mainnet" | "testnet" | "dev"

type NetworkConstants = {
  chainId: number
  chain: SupportedChain
  type: NetworkType
  packagedCertificatesUrl: string
  circuitUrl: string
}

/**
 * Network constants of each chain RegistryClient supports
 */
const NETWORKS: NetworkConstants[] = [
  {
    chainId: getIdFromChain("ethereum"),
    chain: "ethereum",
    type: "mainnet",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_MAINNET,
    circuitUrl: CIRCUIT_URL_MAINNET,
  },
  {
    chainId: getIdFromChain("base"),
    chain: "base",
    type: "mainnet",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_MAINNET,
    circuitUrl: CIRCUIT_URL_MAINNET,
  },
  {
    chainId: getIdFromChain("ethereum_sepolia"),
    chain: "ethereum_sepolia",
    type: "testnet",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_TESTNET,
    circuitUrl: CIRCUIT_URL_SEPOLIA,
  },
  {
    chainId: getIdFromChain("local"),
    chain: "local",
    type: "dev",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_DEV,
    circuitUrl: CIRCUIT_URL_DEV,
  },
]

function getNetworkConstants(chainId: number): NetworkConstants {
  const network = NETWORKS.find((candidate) => candidate.chainId === chainId)
  if (!network) {
    throw new Error(`Unsupported chain ID: ${chainId}`)
  }

  return network
}
