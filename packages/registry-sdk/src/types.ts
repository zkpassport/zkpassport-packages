import type { PackagedCertificate } from "@zkpassport/utils/types"

/**
 * Registry client configuration options
 */
export interface RegistryClientOptions {
  /**
   * Chain ID of the network
   */
  chainId: number

  /**
   * Node RPC URL
   */
  rpcUrl?: string

  /**
   * RootRegistry contract address
   */
  rootRegistry?: string

  /**
   * RegistryHelper contract address
   */
  registryHelper?: string

  /**
   * Packaged certificates file URL generator
   */
  packagedCertsUrlGenerator?: (chainId: number, root: string, cid?: string) => string

  /**
   * Circuit manifest file URL generator
   */
  circuitManifestUrlGenerator?: (
    chainId: number,
    { root, version, cid }: { root?: string; version?: string; cid?: string },
  ) => string

  /**
   * Packaged circuit file URL generator
   */
  packagedCircuitUrlGenerator?: (chainId: number, hash: string, cid?: string) => string

  /**
   * Number of retries for fetching data, default is 3
   */
  retryCount?: number
}

/**
 * Root details from the registry
 */
export interface RootDetails {
  /**
   * Root hash
   */
  root: string

  /**
   * Valid from date
   */
  validFrom: Date

  /**
   * Valid to date or undefined if still valid
   */
  validTo?: Date

  /**
   * Whether the root is revoked
   */
  revoked: boolean

  /**
   * IPFS CID of packaged certificates
   */
  cid: string

  /**
   * Number of leaves in the Merkle tree
   */
  leaves: number

  /**
   * Whether this is the latest root
   */
  isLatest?: boolean

  /**
   * Index of the root in the registry
   */
  index?: number
}

export interface PackagedCertificatesFile {
  // Version of the packaged certificates format (defaults to 0 if not set)
  version: number
  // Timestamp when the package was created and the certificates were validated
  timestamp: number
  // Merkle root of the certificates tree
  root: string
  // Array of packaged certificates
  certificates: PackagedCertificate[]
  // The serialised ordered Merkle tree of certificates
  // Each row represents a level of the tree, with each entry being a node
  serialised?: string[][]
}

export enum DocumentSupport {
  NOT_SUPPORTED = 0,
  TENTATIVE_SUPPORT = 0.25,
  PARTIAL_SUPPORT = 0.5,
  GOOD_SUPPORT = 0.75,
  FULL_SUPPORT = 1,
}

export type DocumentSupportRule = {
  country: string
  id_card_support: DocumentSupport
  residence_permit_support: DocumentSupport
  passport_support: DocumentSupport
}
