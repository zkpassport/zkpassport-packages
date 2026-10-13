import { getNetworkConstants } from "@zkpassport/registry"
import { getIdFromChain } from "@zkpassport/utils"

const SEPOLIA = getNetworkConstants(getIdFromChain("ethereum_sepolia"))

/** SEPOLIA_RPC_URL, or the registry-sdk's built-in Sepolia endpoint */
export const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || SEPOLIA.rpcUrl

export const SEPOLIA_FILE_HOSTS = [SEPOLIA.packagedCertificatesUrl, SEPOLIA.circuitUrl].map(
  (url) => new URL(url).hostname,
)
