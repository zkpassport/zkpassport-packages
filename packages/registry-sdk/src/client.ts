import {
  DEFAULT_HISTORICAL_ROOTS_PAGE_SIZE,
  GET_HISTORICAL_ROOTS_SIGNATURE,
  GET_LATEST_ROOT_DETAILS_SIGNATURE,
  LATEST_ROOT_WITH_PARAM_SIGNATURE,
  PACKAGED_CERTIFICATES_URL_DEV,
  PACKAGED_CERTIFICATES_URL_MAINNET,
  PACKAGED_CERTIFICATES_URL_SEPOLIA,
} from "@/constants"
import { PackagedCertificatesFile, RegistryClientOptions, RootDetails } from "@/types"
import { CERTIFICATE_REGISTRY_ID, PackagedCertificate } from "@zkpassport/utils"
import { buildMerkleTreeFromCerts, hexToCid } from "@zkpassport/utils/registry"
import debug from "debug"

const log = debug("zkpassport:registry")

interface ChainConfig {
  rpcUrl: string
  rootRegistry: string
  registryHelper: string
  packagedCertificatesUrl: string
}

const CHAIN_CONFIG: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x0000000000000000000000000000000000000000",
    registryHelper: "0x0000000000000000000000000000000000000000",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_MAINNET,
  },
  // Sepolia Testnet
  11155111: {
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x9d60e8c4796199535b860fcf814ca90eda93cac1",
    registryHelper: "0xc46b1336b8f3cfd46a3ad3e735fef6eb4252f229",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_SEPOLIA,
  },
  // Local Development (Anvil)
  31337: {
    rpcUrl: "http://localhost:8545",
    rootRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    registryHelper: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_DEV,
  },
}

/**
 * Client for interacting with the ZKPassport Registry
 */
export class RegistryClient {
  private readonly chainId: number
  private readonly rpcUrl: string
  private readonly rootRegistry: string
  private readonly registryHelper: string
  private readonly packagedCertificatesUrl: string

  constructor({
    rpcUrl,
    rootRegistry,
    chainId,
    registryHelper,
    packagedCertificatesUrl,
  }: Partial<RegistryClientOptions> = {}) {
    if (chainId === undefined) throw new Error("chainId is required")
    this.chainId = chainId
    // Get chain config based on chainId
    const chainConfig = CHAIN_CONFIG[chainId]
    // Set config values using provided values or from chain config
    this.rpcUrl = rpcUrl || chainConfig?.rpcUrl
    this.rootRegistry = rootRegistry || chainConfig?.rootRegistry
    this.registryHelper = registryHelper || chainConfig?.registryHelper
    this.packagedCertificatesUrl = packagedCertificatesUrl || chainConfig?.packagedCertificatesUrl
  }

  /**
   * Get latest root of the Certificate Registry
   */
  async getCertificatesRoot(): Promise<string> {
    log(`Fetching latest certificates root from root registry ${this.rootRegistry}`)
    const rpcRequest = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1000000),
      method: "eth_call",
      params: [
        {
          to: this.rootRegistry,
          data:
            LATEST_ROOT_WITH_PARAM_SIGNATURE +
            CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0"),
        },
        "latest",
      ],
    }
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcRequest),
    })
    if (!response.ok)
      throw new Error(
        `Failed to fetch latest certificate registry root: ${response.status} ${response.statusText}`,
      )
    const rpcData = await response.json()
    if (rpcData.error) throw new Error(`Error from blockchain: ${rpcData.error.message}`)
    return rpcData.result
  }

  /**
   * Get packaged certificates
   *
   * @param root The root hash to get certificates for (defaults to latest root)
   * @param validate Whether to validate the certificates against the root hash (defaults to true)
   */
  async getCertificates(
    root?: string,
    { validate = true }: { validate?: boolean } = {},
  ): Promise<PackagedCertificatesFile> {
    if (!root) root = await this.getCertificatesRoot()

    const url = `${this.packagedCertificatesUrl}/${root}`
    log("Fetching certificates from:", url)

    const response = await fetch(url)
    if (!response.ok)
      throw new Error(
        `Failed to fetch certificates for root ${root}: ${response.status} ${response.statusText}`,
      )
    const data = (await response.json()) as PackagedCertificatesFile
    log(`Got ${data.certificates?.length || 0} packaged certificates`)

    // Handle invalid responses
    if (!data.certificates || !Array.isArray(data.certificates))
      throw new Error("Invalid certificates returned")
    if (!data.serialised || !Array.isArray(data.serialised))
      throw new Error("Invalid serialised certificates tree returned")

    if (validate) {
      const valid = await this.validateCertificates(data.certificates, root)
      if (!valid) throw new Error("Root hash validation failed for packaged certificates")
    }
    return data
  }

  /**
   * Validate certificates against a root hash
   */
  async validateCertificates(certificates: PackagedCertificate[], root: string): Promise<boolean> {
    try {
      const { root: calculatedRoot } = await buildMerkleTreeFromCerts(certificates)
      const expectedRootHash = root.startsWith("0x") ? root : `0x${root}`
      const valid = calculatedRoot.toLowerCase() === expectedRootHash.toLowerCase()
      if (valid) {
        log(`Validated packaged certificates against root ${calculatedRoot}`)
      } else {
        log(
          `Error validating packaged certificates against root ${expectedRootHash} using calculated root ${calculatedRoot}`,
        )
      }
      return valid
    } catch (error) {
      console.error("Error validating certificates:", error)
      return false
    }
  }

  /**
   * Get historical certificate registry roots
   *
   * @param fromIndex The root index to start from (defaults to 1, the genesis root)
   * @param limit Maximum number of roots to return per page
   * @returns The roots for this page and a flag indicating if this is the last page
   */
  async getHistoricalCertificateRegistryRoots(
    fromIndex: number = 1,
    limit: number = DEFAULT_HISTORICAL_ROOTS_PAGE_SIZE,
  ): Promise<{ roots: RootDetails[]; isLastPage: boolean }> {
    if (!this.registryHelper) {
      throw new Error("Historical roots helper address is not configured")
    }

    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Math.floor(Math.random() * 1000000),
          method: "eth_call",
          params: [
            {
              to: this.registryHelper,
              data: `${GET_HISTORICAL_ROOTS_SIGNATURE}${
                // registryId parameter (bytes32) padded to 32 bytes
                CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0")
              }${
                // fromIndex parameter (uint256) padded to 32 bytes
                fromIndex.toString(16).padStart(64, "0")
              }${
                // limit parameter (uint256) padded to 32 bytes
                limit.toString(16).padStart(64, "0")
              }`,
            },
            "latest",
          ],
        }),
      })
      const data = await response.json()

      if (data.error) throw new Error(data.error.message || "Error fetching roots")
      if (data.result) {
        // The result is an ABI-encoded tuple of (RootDetails[], bool)
        // We need to extract the array and the isLastPage boolean
        const result = data.result.slice(2) // Remove '0x' prefix

        // First 64 bytes (32 bytes * 2) contain pointers
        // The first 32 bytes are the offset to the array data
        const arrayOffset = parseInt(result.slice(0, 64), 16)
        // The second 32 bytes contain the isLastPage boolean
        const isLastPage = parseInt(result.slice(64, 128), 16) === 1
        // The array data starts at the offset (in bytes) from the start of the return value
        // Skipping the prefix '0x' (2 chars), each byte is 2 chars in hex
        const arrayData = result.slice(arrayOffset * 2)
        // First 32 bytes of the array data is the array length
        const arrayLength = parseInt(arrayData.slice(0, 64), 16)
        // Parse each root detail
        const rootDetails: RootDetails[] = []
        // Each root detail is a struct with the following fields:
        // struct RootDetails {
        //   uint256 index;
        //   bytes32 root;
        //   uint256 validFrom;
        //   uint256 validTo;
        //   bool revoked;
        //   uint256 leaves;
        //   bytes32 cid;
        // }
        for (let i = 0; i < arrayLength; i++) {
          // The RootDetails struct in the helper contract has 7 fields (32 bytes each)
          const startIndex = 64 + i * 7 * 64 // 64 hex chars per 32 bytes

          const index = parseInt(arrayData.slice(startIndex, startIndex + 64), 16)
          const root = `0x${arrayData.slice(startIndex + 64, startIndex + 128)}`
          const validFrom = new Date(
            parseInt(arrayData.slice(startIndex + 128, startIndex + 192), 16) * 1000,
          )
          const validToOrig = parseInt(arrayData.slice(startIndex + 192, startIndex + 256), 16)
          const validTo = validToOrig === 0 ? undefined : new Date(validToOrig * 1000)
          const revoked = parseInt(arrayData.slice(startIndex + 256, startIndex + 320), 16) === 1
          const leaves = parseInt(arrayData.slice(startIndex + 320, startIndex + 384), 16)
          const cid = hexToCid(`0x${arrayData.slice(startIndex + 384, startIndex + 448)}`)
          rootDetails.push({
            root,
            validFrom,
            validTo,
            revoked,
            cid,
            leaves,
            isLatest: i === arrayLength - 1 && isLastPage,
            index,
          })
        }
        return { roots: rootDetails, isLastPage }
      }
      return { roots: [], isLastPage: true }
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  /**
   * Get all historical certificate registry roots by handling pagination internally
   * This method starts from the first root and collects all roots by handling pagination automatically
   *
   * @param pageSize Number of roots to fetch per page
   * @param onProgress Optional callback to report progress during pagination
   * @returns All historical roots from the registry
   */
  async getAllHistoricalCertificateRegistryRoots(
    pageSize: number = DEFAULT_HISTORICAL_ROOTS_PAGE_SIZE,
    onProgress?: (
      pageNumber: number,
      pageRoots: RootDetails[],
      totalRootsSoFar: number,
      isLastPage: boolean,
    ) => void,
  ): Promise<RootDetails[]> {
    if (!this.registryHelper) throw new Error("Historical roots helper address is not configured")

    let pageNumber = 0
    let isLastPage = false
    let currentIndex = 1
    const allRoots: RootDetails[] = []
    while (!isLastPage) {
      const { roots, isLastPage: lastPage } = await this.getHistoricalCertificateRegistryRoots(
        currentIndex,
        pageSize,
      )
      allRoots.push(...roots)
      isLastPage = lastPage
      pageNumber++
      // Update currentIndex for next pagination
      if (roots.length > 0) {
        // Add the number of roots we fetched to move to the next page
        currentIndex += roots.length
      }
      // Invoke progress callback if provided
      if (onProgress) {
        onProgress(pageNumber, roots, allRoots.length, isLastPage)
      }
      // Safety check in case the contract doesn't properly return isLastPage
      if (roots.length === 0) break
    }
    return allRoots
  }

  /**
   * Get latest certificates root details
   */
  // TODO: Change this to getCertificatesRootDetails(root?: string)
  async getLatestCertificatesRootDetails(): Promise<RootDetails> {
    log(
      `Fetching latest certificate registry root details using root registry ${this.rootRegistry}`,
    )
    const rpcRequest = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1000000),
      method: "eth_call",
      params: [
        {
          to: this.registryHelper,
          data:
            GET_LATEST_ROOT_DETAILS_SIGNATURE +
            CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0"),
        },
        "latest",
      ],
    }
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcRequest),
    })
    if (!response.ok)
      throw new Error(
        `Failed to fetch latest certificate registry root details: ${response.status} ${response.statusText}`,
      )
    const data = await response.json()

    if (data.error) throw new Error(`Error from node: ${data.error.message}`)
    if (data.result) {
      // The result is an ABI-encoded RootDetails struct
      const result = data.result.slice(2) // Remove '0x' prefix
      // Each field in the struct is 32 bytes (64 hex chars)
      const index = parseInt(result.slice(0, 64), 16)
      const root = `0x${result.slice(64, 128)}`
      const validFrom = new Date(parseInt(result.slice(128, 192), 16) * 1000)
      const validToOrig = parseInt(result.slice(192, 256), 16)
      const validTo = validToOrig === 0 ? undefined : new Date(validToOrig * 1000)
      const revoked = parseInt(result.slice(256, 320), 16) === 1
      const leaves = parseInt(result.slice(320, 384), 16)
      const cid = hexToCid(`0x${result.slice(384, 448)}`)
      return {
        index,
        root,
        validFrom,
        validTo,
        revoked,
        leaves,
        cid,
        isLatest: true,
      }
    } else throw new Error("No result returned from node")
  }
}
