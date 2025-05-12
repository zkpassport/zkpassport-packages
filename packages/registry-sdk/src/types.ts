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
  circuitManifestUrlGenerator?: (chainId: number, root: string, cid?: string) => string
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
  certificates: PackagedCertificate[]
  serialised: any[]
}
