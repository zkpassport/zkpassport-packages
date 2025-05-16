import {
  CIRCUIT_MANIFEST_URL_TEMPLATE,
  DEFAULT_HISTORICAL_ROOTS_PAGE_SIZE,
  GET_HISTORICAL_ROOTS_SIGNATURE,
  GET_LATEST_ROOT_DETAILS_SIGNATURE,
  LATEST_ROOT_WITH_PARAM_SIGNATURE,
  PACKAGED_CERTIFICATES_URL_TEMPLATE,
  PACKAGED_CIRCUIT_URL_TEMPLATE,
  REGISTRIES_MAPPING_SIGNATURE,
} from "@/constants"
import { PackagedCertificatesFile, RegistryClientOptions, RootDetails } from "@/types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { Binary } from "@zkpassport/utils"
import { ultraVkToFields } from "@zkpassport/utils/circuits"
import {
  buildMerkleTreeFromCerts,
  CERTIFICATE_REGISTRY_ID,
  CIRCUIT_REGISTRY_ID,
  hexToCid,
} from "@zkpassport/utils/registry"
import type {
  CircuitManifest,
  CircuitManifestEntry,
  PackagedCertificate,
  PackagedCircuit,
} from "@zkpassport/utils/types"
import debug from "debug"

const log = debug("zkpassport:registry")

interface ChainConfig {
  rpcUrl: string
  rootRegistry: string
  registryHelper: string
  packagedCertsUrlGenerator: (chainId: number, root: string, cid?: string) => string
  circuitManifestUrlGenerator: (chainId: number, root: string, cid?: string) => string
  packagedCircuitUrlGenerator: (chainId: number, hash: string, cid?: string) => string
}

const CHAIN_CONFIG: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x0000000000000000000000000000000000000000",
    registryHelper: "0x0000000000000000000000000000000000000000",
    packagedCertsUrlGenerator: PACKAGED_CERTIFICATES_URL_TEMPLATE,
    circuitManifestUrlGenerator: CIRCUIT_MANIFEST_URL_TEMPLATE,
    packagedCircuitUrlGenerator: PACKAGED_CIRCUIT_URL_TEMPLATE,
  },
  // Sepolia Testnet
  11155111: {
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x9d60e8c4796199535b860fcf814ca90eda93cac1",
    registryHelper: "0xc46b1336b8f3cfd46a3ad3e735fef6eb4252f229",
    packagedCertsUrlGenerator: PACKAGED_CERTIFICATES_URL_TEMPLATE,
    circuitManifestUrlGenerator: CIRCUIT_MANIFEST_URL_TEMPLATE,
    packagedCircuitUrlGenerator: PACKAGED_CIRCUIT_URL_TEMPLATE,
  },
  // Local Development (Anvil)
  31337: {
    rpcUrl: "http://localhost:8545",
    rootRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    registryHelper: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    packagedCertsUrlGenerator: PACKAGED_CERTIFICATES_URL_TEMPLATE,
    circuitManifestUrlGenerator: CIRCUIT_MANIFEST_URL_TEMPLATE,
    packagedCircuitUrlGenerator: PACKAGED_CIRCUIT_URL_TEMPLATE,
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
  private readonly packagedCertsUrlGenerator: (
    chainId: number,
    root: string,
    cid?: string,
  ) => string
  private readonly circuitManifestUrlGenerator: (
    chainId: number,
    root: string,
    cid?: string,
  ) => string
  private readonly packagedCircuitUrlGenerator: (
    chainId: number,
    hash: string,
    cid?: string,
  ) => string

  constructor({
    rpcUrl,
    rootRegistry,
    chainId,
    registryHelper,
    packagedCertsUrlGenerator,
    circuitManifestUrlGenerator,
    packagedCircuitUrlGenerator,
  }: Partial<RegistryClientOptions> = {}) {
    if (chainId === undefined) throw new Error("chainId is required")
    this.chainId = chainId
    // Get chain config based on chainId
    const chainConfig = CHAIN_CONFIG[chainId]
    // Set config values using provided values or from chain config
    this.rpcUrl = rpcUrl || chainConfig?.rpcUrl
    this.rootRegistry = rootRegistry || chainConfig?.rootRegistry
    this.registryHelper = registryHelper || chainConfig?.registryHelper
    this.packagedCertsUrlGenerator =
      packagedCertsUrlGenerator || chainConfig?.packagedCertsUrlGenerator
    this.circuitManifestUrlGenerator =
      circuitManifestUrlGenerator || chainConfig?.circuitManifestUrlGenerator
    this.packagedCircuitUrlGenerator =
      packagedCircuitUrlGenerator || chainConfig?.packagedCircuitUrlGenerator
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
    if (!response.ok) {
      throw new Error(
        `Failed to fetch latest certificate registry root: ${response.status} ${response.statusText}`,
      )
    }
    const rpcData = await response.json()
    if (rpcData.error) throw new Error(`Error from blockchain: ${rpcData.error.message}`)
    log(`Got latest certificates root: ${rpcData.result}`)
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
    { validate = true, ipfs = false }: { validate?: boolean; ipfs?: boolean } = {},
  ): Promise<PackagedCertificatesFile> {
    if (!root) root = await this.getCertificatesRoot()

    // TODO: Add support for IPFS flag by looking up the CID for this root
    if (ipfs) throw new Error("IPFS flag not implemented")

    const url = this.packagedCertsUrlGenerator(this.chainId, root)
    log("Fetching certificates from:", url)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch certificates for root ${root}: ${response.status} ${response.statusText}`,
      )
    }
    const data = (await response.json()) as PackagedCertificatesFile
    log(`Got ${data.certificates?.length || 0} packaged certificates`)

    // Handle invalid responses
    if (!data.certificates || !Array.isArray(data.certificates))
      throw new Error("Invalid certificates returned")
    if (!data.serialised || !Array.isArray(data.serialised))
      throw new Error("Invalid serialised certificates tree returned")

    if (validate) {
      const valid = await this.validateCertificates(data.certificates, root)
      if (!valid) throw new Error(`Validation failed for packaged certificates: ${root}`)
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
          `Error validating packaged certificates. Expected: ${expectedRootHash} Got: ${calculatedRoot}`,
        )
      }
      return valid
    } catch (error) {
      console.error("Error validating circuit manifest:", error)
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
    if (!response.ok) {
      throw new Error(
        `Failed to fetch latest certificate registry root details: ${response.status} ${response.statusText}`,
      )
    }
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

  /**
   * Get latest root of the Circuit Registry
   */
  async getCircuitsRoot(): Promise<string> {
    log(`Fetching latest circuits root from root registry ${this.rootRegistry}`)
    const rpcRequest = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1000000),
      method: "eth_call",
      params: [
        {
          to: this.rootRegistry,
          data:
            LATEST_ROOT_WITH_PARAM_SIGNATURE + CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0"),
        },
        "latest",
      ],
    }
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcRequest),
    })
    if (!response.ok) {
      throw new Error(
        `Failed to fetch latest circuits registry root: ${response.status} ${response.statusText}`,
      )
    }
    const rpcData = await response.json()
    if (rpcData.error) throw new Error(`Error from blockchain: ${rpcData.error.message}`)
    log(`Got latest circuits root: ${rpcData.result}`)
    return rpcData.result
  }

  /**
   * Get circuit manifest
   *
   * @param root Optional root hash to get circuit manifest for (defaults to latest root)
   * @param validate Whether to validate the circuit manifest against the root hash (defaults to true)
   */
  async getCircuitManifest(
    root?: string,
    { validate = true, ipfs = false }: { validate?: boolean; ipfs?: boolean } = {},
  ): Promise<CircuitManifest> {
    if (!root) root = await this.getCircuitsRoot()

    // TODO: Add support for IPFS flag
    if (ipfs) throw new Error("IPFS flag not implemented")

    const url = this.circuitManifestUrlGenerator(this.chainId, root)
    log("Fetching circuit manifest from:", url)

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch circuit manifest for root ${root}: ${response.status} ${response.statusText}`,
      )
    }
    const data = (await response.json()) as CircuitManifest
    if (!data.version || !data.root || !data.circuits)
      throw new Error("Invalid circuit manifest returned")
    log(`Got circuit manifest for root ${root}`)

    if (validate) {
      const valid = await this.validateCircuitManifest(data, root)
      if (!valid) throw new Error(`Validation failed for circuit manifest: ${root}`)
    }
    return data
  }

  /**
   * Validate circuit manifest against a root hash
   */
  async validateCircuitManifest(manifest: CircuitManifest, root?: string): Promise<boolean> {
    try {
      // Loop over the circuit hashes and convert them to a bigint
      const circuitHashes = (Object.values(manifest.circuits) as CircuitManifestEntry[]).map(
        (circuit: { hash: string }) => BigInt(circuit.hash),
      )
      // Hash the circuit hashes using Poseidon2
      const hash = await poseidon2HashAsync([...circuitHashes])
      const calculatedRoot = `0x${hash.toString(16).padStart(64, "0")}`
      // Compare using the root provided or if not provided use the root in the manifest
      const expectedRootHash = root
        ? root.startsWith("0x")
          ? root
          : `0x${root}`
        : manifest.root.startsWith("0x")
          ? manifest.root
          : `0x${manifest.root}`

      const valid = calculatedRoot.toLowerCase() === expectedRootHash.toLowerCase()
      if (valid) {
        log(`Validated circuit manifest against root ${calculatedRoot}`)
      } else {
        log(
          `Error validating circuit manifest. Expected: ${expectedRootHash} Got: ${calculatedRoot}`,
        )
      }
      return valid
    } catch (error) {
      console.error("Error validating circuit manifest:", error)
      return false
    }
  }

  /**
   * Validate packaged circuit against an optional vkey hash
   *
   * @param circuit The packaged circuit to validate
   * @param hash Optional hash to validate against (defaults to the vkey hash in the circuit)
   */
  async validatePackagedCircuit(circuit: PackagedCircuit, hash?: string): Promise<boolean> {
    const expectedHash = hash || circuit.vkey_hash
    const vkeyHashFields = ultraVkToFields(Binary.fromBase64(circuit.vkey).toUInt8Array())
    const calculatedHash =
      "0x" + (await poseidon2HashAsync(vkeyHashFields.map(BigInt))).toString(16)

    const valid = calculatedHash.toLowerCase() === expectedHash.toLowerCase()
    if (valid) {
      log(`Validated packaged circuit against hash ${expectedHash}`)
    } else {
      log(`Error validating packaged circuit. Expected: ${expectedHash} Got: ${calculatedHash}`)
    }
    return valid
  }

  async getPackagedCircuit(
    circuit: string,
    manifest: CircuitManifest,
    { validate = true, ipfs = false }: { validate?: boolean; ipfs?: boolean } = {},
  ): Promise<PackagedCircuit> {
    // TODO: Add support for IPFS flag
    if (ipfs) throw new Error("IPFS flag not implemented")

    const circuitHash = manifest.circuits[circuit]?.hash || null
    if (!circuitHash) throw new Error(`Circuit ${circuit} not found in manifest`)

    const url = this.packagedCircuitUrlGenerator(this.chainId, circuitHash)
    log("Fetching packaged circuit from:", url)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch packaged circuit for ${circuit}: ${response.status} ${response.statusText}`,
      )
    }
    const data = (await response.json()) as PackagedCircuit
    if (!data.name || !data.hash || !data.noir_version || !data.bb_version)
      throw new Error(`Invalid packaged circuit returned for ${circuit}`)
    log(`Got packaged circuit for ${circuit}`)

    if (validate) {
      const valid = await this.validatePackagedCircuit(data, circuitHash)
      if (!valid) throw new Error(`Validation failed for packaged circuit: ${circuit}`)
    }
    return data
  }

  // /**
  //  * Get historical circuits registry roots
  //  *
  //  * @param fromIndex The root index to start from (defaults to 1, the genesis root)
  //  * @param limit Maximum number of roots to return per page
  //  * @returns The roots for this page and a flag indicating if this is the last page
  //  */
  async getHistoricalCircuitRegistryRoots(
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
                CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0")
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
   * Get all historical circuit registry roots by handling pagination internally
   * This method starts from the first root and collects all roots by handling pagination automatically
   *
   * @param pageSize Number of roots to fetch per page
   * @param onProgress Optional callback to report progress during pagination
   * @returns All historical roots from the registry
   */
  async getAllHistoricalCircuitRegistryRoots(
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
      const { roots, isLastPage: lastPage } = await this.getHistoricalCircuitRegistryRoots(
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
   * Get latest circuits root details
   */
  // TODO: Change this to getCircuitsRootDetails(root?: string)
  async getLatestCircuitsRootDetails(): Promise<RootDetails> {
    log(`Fetching latest circuits registry root details using root registry ${this.rootRegistry}`)
    const rpcRequest = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1000000),
      method: "eth_call",
      params: [
        {
          to: this.registryHelper,
          data:
            GET_LATEST_ROOT_DETAILS_SIGNATURE + CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0"),
        },
        "latest",
      ],
    }
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcRequest),
    })
    if (!response.ok) {
      throw new Error(
        `Failed to fetch latest circuits registry root details: ${response.status} ${response.statusText}`,
      )
    }
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

  /**
   * Get registry address for a specific registryId
   * @param registryId The registry ID to look up (number or hex string)
   * @returns The registry address as a hex string
   */
  async getRegistryAddress(registryId: number | string): Promise<string> {
    log(`Fetching registry address for ID ${registryId} from root registry ${this.rootRegistry}`)

    let formattedRegistryId: string
    if (typeof registryId === "string" && registryId.startsWith("0x")) {
      formattedRegistryId = `0x${registryId.substring(2).padStart(64, "0")}`
    } else if (typeof registryId === "number") {
      formattedRegistryId = `0x${registryId.toString(16).padStart(64, "0")}`
    } else {
      throw new Error(`Invalid registry ID: ${registryId}`)
    }

    const rpcRequest = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1000000),
      method: "eth_call",
      params: [
        {
          to: this.rootRegistry,
          data: `${REGISTRIES_MAPPING_SIGNATURE}${formattedRegistryId.slice(2)}`,
        },
        "latest",
      ],
    }
    try {
      const response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcRequest),
      })
      if (!response.ok) {
        throw new Error(
          `Error getting address for registry ID ${registryId}: ${response.status} ${response.statusText}`,
        )
      }
      const rpcData = await response.json()
      if (rpcData.error) {
        throw new Error(
          `Error getting address for registry ID ${registryId}: ${rpcData.error.message}`,
        )
      }
      if (rpcData.result === "0x0000000000000000000000000000000000000000000000000000000000000000") {
        throw new Error(`Registry ID ${registryId} doesn't exist`)
      }
      // Parse the address from the result
      // Address is 20 bytes (40 hex chars) but padded to 32 bytes in the response
      const address = `0x${rpcData.result.slice(-40)}`
      log(`Got address for registry ID ${registryId}: ${address}`)
      return address
    } catch (err) {
      throw new Error(`Error getting address for registry ID ${registryId}: ${err}`)
    }
  }

  /**
   * Get the address of the Certificate Registry
   * @returns The address of the Certificate Registry
   */
  async getCertificateRegistryAddress(): Promise<string> {
    return this.getRegistryAddress(CERTIFICATE_REGISTRY_ID)
  }

  /**
   * Get the address of the Circuit Registry
   * @returns The address of the Circuit Registry
   */
  async getCircuitRegistryAddress(): Promise<string> {
    return this.getRegistryAddress(CIRCUIT_REGISTRY_ID)
  }
}
