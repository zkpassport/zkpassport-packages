import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { Binary } from "@zkpassport/utils"
import { PackagedCertificatesFile } from "@zkpassport/utils/types"
import { ultraVkToFields } from "@zkpassport/utils/circuits"
import {
  buildMerkleTreeFromCerts,
  calculateCircuitRoot,
  CERTIFICATE_REGISTRY_ID,
  CIRCUIT_REGISTRY_ID,
  hexToCidv0,
} from "@zkpassport/utils/registry"
import type {
  CircuitManifest,
  CircuitManifestEntry,
  PackagedCircuit,
} from "@zkpassport/utils/types"
import debug from "debug"
import {
  CIRCUIT_MANIFEST_URL_TEMPLATE,
  DEFAULT_HISTORICAL_ROOTS_PAGE_SIZE,
  DEFAULT_RETRY_COUNT,
  GET_HISTORICAL_ROOTS_BY_HASH_SIGNATURE,
  GET_HISTORICAL_ROOTS_SIGNATURE,
  GET_LATEST_ROOT_DETAILS_SIGNATURE,
  GET_ROOT_DETAILS_BY_ROOT_SIGNATURE,
  IS_ROOT_VALID_SIGNATURE,
  LATEST_ROOT_WITH_PARAM_SIGNATURE,
  PACKAGED_CERTIFICATES_URL_TEMPLATE,
  PACKAGED_CIRCUIT_URL_TEMPLATE,
  REGISTRIES_MAPPING_SIGNATURE,
} from "./constants"
import {
  DocumentSupport,
  DocumentSupportRule,
  RegistryClientOptions,
  type RootDetails,
} from "./types"
import { normaliseHash, strip0x } from "./utils"
import { withRetry } from "@zkpassport/utils"
import { PackagedCertificatesFile } from "@zkpassport/utils/types"
import documentSupportRules from "./document-support-rules.json"

const log = debug("zkpassport:registry")

interface ChainConfig {
  rpcUrl: string
  rootRegistry: string
  registryHelper: string
  packagedCertsUrlGenerator: (chainId: number, root: string, cid?: string) => string
  circuitManifestUrlGenerator: (
    chainId: number,
    { root, version, cid }: { root?: string; version?: string; cid?: string },
  ) => string
  packagedCircuitUrlGenerator: (chainId: number, hash: string, cid?: string) => string
}

const CHAIN_CONFIG: Record<number, ChainConfig> = {
  // Ethereum Mainnet
  1: {
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70",
    registryHelper: "0x0000000000000000000000000000000000000000",
    packagedCertsUrlGenerator: PACKAGED_CERTIFICATES_URL_TEMPLATE,
    circuitManifestUrlGenerator: CIRCUIT_MANIFEST_URL_TEMPLATE,
    packagedCircuitUrlGenerator: PACKAGED_CIRCUIT_URL_TEMPLATE,
  },
  // Sepolia Testnet
  11155111: {
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70",
    registryHelper: "0x0ea1dBf32763D2Bab8bf7C33d6c17771506510D6",
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
    { root, version, cid }: { root?: string; version?: string; cid?: string },
  ) => string
  private readonly packagedCircuitUrlGenerator: (
    chainId: number,
    hash: string,
    cid?: string,
  ) => string
  private readonly retryCount: number

  constructor({
    rpcUrl,
    rootRegistry,
    chainId,
    registryHelper,
    packagedCertsUrlGenerator,
    circuitManifestUrlGenerator,
    packagedCircuitUrlGenerator,
    retryCount,
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
    this.retryCount = retryCount || DEFAULT_RETRY_COUNT
  }

  /**
   * Get latest Certificate Registry root
   */
  async getLatestCertificateRoot(): Promise<string> {
    log("Getting latest certificate root", { registry: this.rootRegistry })
    const response = await this.rpcRequest(
      this.rootRegistry,
      LATEST_ROOT_WITH_PARAM_SIGNATURE + CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0"),
    )
    if (!response.ok) {
      throw new Error(
        `Failed to get latest certificate root: ${response.status} ${response.statusText}`,
      )
    }
    const rpcData = await response.json()
    if (rpcData.error) throw new Error(`Error from blockchain: ${rpcData.error.message}`)
    log(`Got latest certificates root: ${rpcData.result}`)
    return rpcData.result
  }

  /**
   * Check if a certificate root is valid
   *
   * @param root The root hash to check
   * @param timestamp Optional timestamp to check validity for (defaults to current time)
   * @returns True if the root is valid, false otherwise
   */
  async isCertificateRootValid(root: string, timestamp?: number): Promise<boolean> {
    root = normaliseHash(root)
    const ts = timestamp ?? Math.floor(Date.now() / 1000)
    const response = await this.rpcRequest(
      this.rootRegistry,
      IS_ROOT_VALID_SIGNATURE +
        CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0") +
        strip0x(root) +
        ts.toString(16).padStart(64, "0"),
    )
    if (!response.ok) {
      throw new Error(
        `Error checking if certificate root is valid: ${response.status} ${response.statusText}`,
      )
    }
    const rpcData = await response.json()
    if (rpcData.error) throw new Error(`Error from blockchain: ${rpcData.error.message}`)
    return parseInt(strip0x(rpcData.result)) === 1
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
    if (!root) root = await this.getLatestCertificateRoot()
    else root = normaliseHash(root)

    // TODO: Add support for IPFS flag by looking up the CID for this root
    if (ipfs) throw new Error("IPFS flag not implemented")

    const url = this.packagedCertsUrlGenerator(this.chainId, root)
    log("Getting certificates from:", url)
    const response = await withRetry(() => fetch(url), this.retryCount)
    if (!response.ok) {
      throw new Error(
        `Failed to get certificates for root ${root}: ${response.status} ${response.statusText}`,
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
      const valid = await this.validateCertificates(data, root)
      if (!valid) throw new Error(`Validation failed for packaged certificates: ${root}`)
    }
    return data
  }

  /**
   * Validate certificates against a root hash
   */
  async validateCertificates(
    packagedCerts: PackagedCertificatesFile,
    root: string,
  ): Promise<boolean> {
    try {
      const { root: calculatedRoot } = await buildMerkleTreeFromCerts(
        packagedCerts.certificates,
        packagedCerts.version,
      )
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
   * Get historical certificate roots
   *
   * @param from The root index or hash to start from (defaults to 1, the genesis root)
   * @param limit Maximum number of roots to return per page
   * @returns The roots for this page and a flag indicating if this is the last page
   */
  async getHistoricalCertificateRoots(
    from: number | string,
    limit: number = DEFAULT_HISTORICAL_ROOTS_PAGE_SIZE,
  ): Promise<{ roots: RootDetails[]; isLastPage: boolean }> {
    if (!this.registryHelper) throw new Error("Historical roots helper address not configured")
    const fromRoot = typeof from === "string" ? strip0x(from) : (from ?? 1)
    const requestData =
      typeof fromRoot === "number"
        ? `${GET_HISTORICAL_ROOTS_SIGNATURE}${
            // registryId parameter (bytes32) padded to 32 bytes
            CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0")
          }${
            // startIndex parameter (uint256) padded to 32 bytes
            fromRoot.toString(16).padStart(64, "0")
          }${
            // limit parameter (uint256) padded to 32 bytes
            limit.toString(16).padStart(64, "0")
          }`
        : `${GET_HISTORICAL_ROOTS_BY_HASH_SIGNATURE}${
            // registryId parameter (bytes32) padded to 32 bytes
            CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0")
          }${
            // fromRoot parameter (bytes32) padded to 32 bytes
            fromRoot.padStart(64, "0")
          }${
            // limit parameter (uint256) padded to 32 bytes
            limit.toString(16).padStart(64, "0")
          }`
    try {
      const response = await this.rpcRequest(this.registryHelper, requestData)
      return this._handleHistoricalRootsResponse(response)
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  /**
   * Get all historical certificate registry roots by handling pagination internally
   * This method starts from the first root and collects all roots by handling pagination automatically
   *
   * @param pageSize Number of roots to get per page
   * @param onProgress Optional callback to report progress during pagination
   * @returns All historical roots from the registry
   */
  async getAllHistoricalCertificateRoots(
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
      const { roots, isLastPage: lastPage } = await this.getHistoricalCertificateRoots(
        currentIndex,
        pageSize,
      )
      allRoots.push(...roots)
      isLastPage = lastPage
      pageNumber++
      // Update currentIndex for next pagination
      if (roots.length > 0) currentIndex += roots.length
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
   * Get certificate root details
   * @param root Optional root to get details for (defaults to latest)
   */
  async getCertificateRootDetails(root?: string): Promise<RootDetails> {
    if (root) {
      log("Getting certificate root details")
      const response = await this.rpcRequest(
        this.registryHelper,
        GET_ROOT_DETAILS_BY_ROOT_SIGNATURE +
          CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0") +
          strip0x(root).padStart(64, "0"),
      )
      if (!response.ok) {
        throw new Error(
          `Failed to get certificate root details: ${response.status} ${response.statusText}`,
        )
      }
      return this._handleRootDetailsResponse(response)
    }
    log("Getting latest certificate root details")
    const response = await this.rpcRequest(
      this.registryHelper,
      GET_LATEST_ROOT_DETAILS_SIGNATURE + CERTIFICATE_REGISTRY_ID.toString(16).padStart(64, "0"),
    )
    if (!response.ok) {
      throw new Error(
        `Failed to get latest certificate root details: ${response.status} ${response.statusText}`,
      )
    }
    return this._handleRootDetailsResponse(response)
  }

  /**
   * Get latest Circuit Registry root
   */
  async getLatestCircuitRoot(): Promise<string> {
    log("Getting latest circuit root", { registry: this.rootRegistry })
    const response = await this.rpcRequest(
      this.rootRegistry,
      LATEST_ROOT_WITH_PARAM_SIGNATURE + CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0"),
    )
    if (!response.ok) {
      throw new Error(
        `Failed to get latest circuit root: ${response.status} ${response.statusText}`,
      )
    }
    const rpcData = await response.json()
    if (rpcData.error) throw new Error(`Error from blockchain: ${rpcData.error.message}`)
    log(`Got latest circuit root: ${rpcData.result}`)
    return rpcData.result
  }

  /**
   * Check if a circuit root is valid
   *
   * @param root The root hash to check
   * @param timestamp Optional timestamp to check validity for (defaults to current time)
   * @returns True if the root is valid, false otherwise
   */
  async isCircuitRootValid(root: string, timestamp?: number): Promise<boolean> {
    root = normaliseHash(root)
    const ts = timestamp ?? Math.floor(Date.now() / 1000)
    const response = await this.rpcRequest(
      this.rootRegistry,
      IS_ROOT_VALID_SIGNATURE +
        CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0") +
        strip0x(root) +
        ts.toString(16).padStart(64, "0"),
    )
    if (!response.ok) {
      throw new Error(
        `Error checking if circuit root is valid: ${response.status} ${response.statusText}`,
      )
    }
    const rpcData = await response.json()
    if (rpcData.error) throw new Error(`Error from blockchain: ${rpcData.error.message}`)
    return parseInt(strip0x(rpcData.result)) === 1
  }

  /**
   * Get circuit manifest
   *
   * @param root Optional root hash to get circuit manifest for (defaults to latest root)
   * @param validate Whether to validate the circuit manifest against the root hash (defaults to true)
   * @param version Optional version to get circuit manifest for (defaults to latest version)
   */
  async getCircuitManifest(
    root?: string,
    {
      validate = true,
      ipfs = false,
      version = undefined,
    }: { validate?: boolean; ipfs?: boolean; version?: string } = {},
  ): Promise<CircuitManifest> {
    if (!root && !version) root = await this.getLatestCircuitRoot()
    else if (root) root = normaliseHash(root)

    // TODO: Add support for IPFS flag
    if (ipfs) throw new Error("IPFS flag not implemented")

    const url = this.circuitManifestUrlGenerator(this.chainId, { root, version })
    log("Getting circuit manifest from:", url)
    const response = await withRetry(() => fetch(url), this.retryCount)
    if (!response.ok) {
      throw new Error(
        `Failed to get circuit manifest for root ${root}: ${response.status} ${response.statusText}`,
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
      // Validate circuit root in manifest against calculated root from circuit vkey hashes
      const circuitHashes = (Object.values(manifest.circuits) as CircuitManifestEntry[]).map(
        (circuit: { hash: string }) => circuit.hash,
      )
      const calculatedRoot = normaliseHash(await calculateCircuitRoot({ hashes: circuitHashes }))
      // Compare using the provided root or manifest root
      const expectedRoot = normaliseHash(root || manifest.root)

      const valid = calculatedRoot.toLowerCase() === expectedRoot.toLowerCase()
      if (valid) {
        log(`Validated circuit manifest against root ${calculatedRoot}`)
      } else {
        log(`Error validating circuit manifest. Expected: ${expectedRoot} Got: ${calculatedRoot}`)
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
  // TODO: Update ultraVkToFields to use VerificationKey.fromBuffer() in aztec-packages
  static async validatePackagedCircuit(circuit: PackagedCircuit, hash?: string): Promise<boolean> {
    const expectedHash = normaliseHash(hash || circuit.vkey_hash)
    const vkeyHashFields = ultraVkToFields(Binary.fromBase64(circuit.vkey).toUInt8Array())
    const calculatedHash = normaliseHash(
      (await poseidon2HashAsync(vkeyHashFields.map(BigInt))).toString(16),
    )
    const valid = calculatedHash === expectedHash
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
    log("Getting packaged circuit from:", url)
    const response = await withRetry(() => fetch(url), this.retryCount)
    if (!response.ok) {
      throw new Error(
        `Failed to get packaged circuit for ${circuit}: ${response.status} ${response.statusText}`,
      )
    }
    const data = (await response.json()) as PackagedCircuit
    if (!data.name || !data.hash || !data.noir_version || !data.bb_version)
      throw new Error(`Invalid packaged circuit returned for ${circuit}`)
    log(`Got packaged circuit for ${circuit}`)

    if (validate) {
      const valid = await RegistryClient.validatePackagedCircuit(data, circuitHash)
      if (!valid) throw new Error(`Validation failed for packaged circuit: ${circuit}`)
    }
    return data
  }

  /**
   * Get historical circuit roots
   *
   * @param from The root index or hash to start from (defaults to 1, the genesis root)
   * @param limit Maximum number of roots to return per page
   * @returns The roots for this page and a flag indicating if this is the last page
   */
  async getHistoricalCircuitRoots(
    from: number | string,
    limit: number = DEFAULT_HISTORICAL_ROOTS_PAGE_SIZE,
  ): Promise<{ roots: RootDetails[]; isLastPage: boolean }> {
    if (!this.registryHelper) throw new Error("Historical roots helper address not configured")
    const fromRoot = typeof from === "string" ? strip0x(from) : (from ?? 1)
    const requestData =
      typeof fromRoot === "number"
        ? `${GET_HISTORICAL_ROOTS_SIGNATURE}${
            // registryId parameter (bytes32) padded to 32 bytes
            CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0")
          }${
            // startIndex parameter (uint256) padded to 32 bytes
            fromRoot.toString(16).padStart(64, "0")
          }${
            // limit parameter (uint256) padded to 32 bytes
            limit.toString(16).padStart(64, "0")
          }`
        : `${GET_HISTORICAL_ROOTS_BY_HASH_SIGNATURE}${
            // registryId parameter (bytes32) padded to 32 bytes
            CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0")
          }${
            // fromRoot parameter (bytes32) padded to 32 bytes
            fromRoot.padStart(64, "0")
          }${
            // limit parameter (uint256) padded to 32 bytes
            limit.toString(16).padStart(64, "0")
          }`
    try {
      const response = await this.rpcRequest(this.registryHelper, requestData)
      return this._handleHistoricalRootsResponse(response)
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  /**
   * Get all historical circuit registry roots by handling pagination internally
   * This method starts from the first root and collects all roots by handling pagination automatically
   *
   * @param pageSize Number of roots to get per page
   * @param onProgress Optional callback to report progress during pagination
   * @returns All historical roots from the registry
   */
  async getAllHistoricalCircuitRoots(
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
      const { roots, isLastPage: lastPage } = await this.getHistoricalCircuitRoots(
        currentIndex,
        pageSize,
      )
      allRoots.push(...roots)
      isLastPage = lastPage
      pageNumber++
      // Update currentIndex for next pagination
      if (roots.length > 0) currentIndex += roots.length
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
   * Get circuit root details
   * @param root Optional root to get details for (defaults to latest)
   */
  async getCircuitRootDetails(root?: string): Promise<RootDetails> {
    if (root) {
      log("Getting circuit root details")
      const response = await this.rpcRequest(
        this.registryHelper,
        GET_ROOT_DETAILS_BY_ROOT_SIGNATURE +
          CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0") +
          strip0x(root).padStart(64, "0"),
      )
      if (!response.ok) {
        throw new Error(
          `Failed to get circuit root details: ${response.status} ${response.statusText}`,
        )
      }
      return this._handleRootDetailsResponse(response)
    }
    log("Getting latest circuit root details")
    const response = await this.rpcRequest(
      this.registryHelper,
      GET_LATEST_ROOT_DETAILS_SIGNATURE + CIRCUIT_REGISTRY_ID.toString(16).padStart(64, "0"),
    )
    if (!response.ok) {
      throw new Error(
        `Failed to get latest circuit root details: ${response.status} ${response.statusText}`,
      )
    }
    return this._handleRootDetailsResponse(response)
  }

  /**
   * Get registry address for a specific registryId
   * @param registryId The registry ID to look up (number or hex string)
   * @returns The registry address as a hex string
   */
  async getRegistryAddress(registryId: number | string): Promise<string> {
    log(`Getting registry address for ID ${registryId} from root registry ${this.rootRegistry}`)

    let formattedRegistryId: string
    if (typeof registryId === "string" && registryId.startsWith("0x")) {
      formattedRegistryId = `0x${registryId.substring(2).padStart(64, "0")}`
    } else if (typeof registryId === "number") {
      formattedRegistryId = `0x${registryId.toString(16).padStart(64, "0")}`
    } else {
      throw new Error(`Invalid registry ID: ${registryId}`)
    }

    try {
      const response = await this.rpcRequest(
        this.rootRegistry,
        `${REGISTRIES_MAPPING_SIGNATURE}${formattedRegistryId.slice(2)}`,
      )
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
   * Check if a document is likely to be supported for proving
   *
   * @param country The Alpha3 country code of the document
   * @param issueDate The issue date of the document
   * @param type The type of the document (passport, id_card, residence_permit)
   * @returns The document support level (NOT_SUPPORTED, TENTATIVE_SUPPORT, PARTIAL_SUPPORT, GOOD_SUPPORT, FULL_SUPPORT)
   */
  async isDocumentSupported(
    country: string,
    issueDate?: Date,
    type: "passport" | "id_card" | "residence_permit" = "passport",
  ): Promise<DocumentSupport> {
    if (issueDate) {
      const certificates = await this.getCertificates()

      const hasValidCertificate = certificates.certificates
        .filter((c) => c.country === country)
        .some((c) => {
          // Check if the issue date is after the validity start date of
          // one of the certificates of the issuing country
          return Math.floor(issueDate.getTime() / 1000) >= c.validity.not_before
        })

      if (!hasValidCertificate) {
        // Stop here if no valid certificate is found
        // and return NOT_SUPPORTED.
        return DocumentSupport.NOT_SUPPORTED
      }
      // Otherwise, continue with the rest of the logic.
    }

    const countrySupport = documentSupportRules.find(
      (rule: DocumentSupportRule) => rule.country === country,
    )
    if (countrySupport) {
      return countrySupport[`${type}_support`] as DocumentSupport
    } else {
      return DocumentSupport.NOT_SUPPORTED
    }
  }

  /**
   * Get the address of the Root Registry
   * @returns The address of the Root Registry
   */
  getRootRegistryAddress(): string {
    return this.rootRegistry
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

  getUrlForPackagedCertificates(root: string, cid?: string): string {
    return this.packagedCertsUrlGenerator(this.chainId, root, cid)
  }

  getUrlForCircuitManifestByRoot(root: string): string {
    return this.circuitManifestUrlGenerator(this.chainId, { root })
  }

  getUrlForCircuitManifestByVersion(version: string): string {
    return this.circuitManifestUrlGenerator(this.chainId, { version })
  }

  getUrlForCircuitManifestByCid(cid: string): string {
    return this.circuitManifestUrlGenerator(this.chainId, { cid })
  }

  getUrlForPackagedCircuits(hash: string, cid?: string): string {
    return this.packagedCircuitUrlGenerator(this.chainId, hash, cid)
  }

  private async rpcRequest(to: string, data: string): Promise<Response> {
    return withRetry(
      () =>
        fetch(this.rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: Math.floor(Math.random() * 1000000),
            method: "eth_call",
            params: [{ to, data }, "latest"],
          }),
        }),
      this.retryCount,
    )
  }

  private async _handleRootDetailsResponse(response: Response): Promise<RootDetails> {
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
      const cid = hexToCidv0(`0x${result.slice(384, 448)}`)
      return {
        index,
        root,
        validFrom,
        validTo,
        revoked,
        leaves,
        cid,
        isLatest: validTo === undefined ? true : false,
      }
    } else throw new Error("No result returned from node")
  }

  async _handleHistoricalRootsResponse(
    response: Response,
  ): Promise<{ roots: RootDetails[]; isLastPage: boolean }> {
    const data = await response.json()
    if (data.error) throw new Error(data?.error?.message || "Error getting roots")
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
        const cid = hexToCidv0(`0x${arrayData.slice(startIndex + 384, startIndex + 448)}`)
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
  }
}
