import { getIdFromChain } from "@zkpassport/utils"
import type { SupportedChain } from "@zkpassport/utils/types"

type NetworkType = "mainnet" | "testnet" | "dev"

type NetworkConstants = {
  chainId: number
  chain: SupportedChain
  /** Whether the registry is the RootRegistry contract on an EVM chain or the ZKPassportRegistry contract on Aztec */
  kind: "evm" | "aztec"
  type: NetworkType
  /** The JSON-RPC URL of an EVM node, or of an Aztec node */
  rpcUrl: string
  /** The address of the contract holding the certificate, circuit and sanctions roots */
  rootRegistry: string
  /** The RegistryHelper contract, which only EVM chains have */
  registryHelper?: string
  packagedCertificatesUrl: string
  circuitUrl: string
}

/**
 * Find the network constants of a chain
 * @param chainId - The chain ID
 * @returns The network constants, or undefined if RegistryClient does not support the chain
 */
export function findNetworkConstants(chainId: number): NetworkConstants | undefined {
  return NETWORKS.find((network) => network.chainId === chainId)
}

/**
 * Get the network constants of a chain
 * @param chainId - The chain ID
 * @throws If RegistryClient does not support the chain
 */
export function getNetworkConstants(chainId: number): NetworkConstants {
  const network = findNetworkConstants(chainId)
  if (!network) {
    throw new Error(`Unsupported chain ID: ${chainId}`)
  }

  return network
}

/**
 * Packaged certificates URLs
 */
const PACKAGED_CERTIFICATES_URL_MAINNET = "https://certificates.zkpassport.id/mainnet"
const PACKAGED_CERTIFICATES_URL_TESTNET = "https://certificates.zkpassport.id/testnet"
const PACKAGED_CERTIFICATES_URL_DEV = "http://localhost:8000/root"

/**
 * Circuit URLs
 */
const CIRCUIT_URL_MAINNET = "https://circuits2.zkpassport.id/mainnet"
const CIRCUIT_URL_SEPOLIA = "https://circuits2.zkpassport.id/testnet"
const CIRCUIT_URL_DEV = "http://localhost:8000"

/**
 * Network constants of each chain RegistryClient supports
 */
const NETWORKS: NetworkConstants[] = [
  {
    chainId: getIdFromChain("ethereum"),
    chain: "ethereum",
    kind: "evm",
    type: "mainnet",
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70",
    registryHelper: "0x8C93bB3a7ED88dA0647Ea53f8cd3f57832a513Cd",
    // registryHelper: "0x0467c57Cadfc256E6a93abd5401BAF26Bdd382ef", // New RegistryHelper for canonical root registry
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_MAINNET,
    circuitUrl: CIRCUIT_URL_MAINNET,
  },
  {
    chainId: getIdFromChain("base"),
    chain: "base",
    kind: "evm",
    type: "mainnet",
    rpcUrl: "https://base-mainnet.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70",
    registryHelper: "0xC404C605130F3345E1A2BFdf3BAFABED7234cCa7",
    // registryHelper: "0xC404C605130F3345E1A2BFdf3BAFABED7234cCa7", // New RegistryHelper for canonical root registry
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_MAINNET,
    circuitUrl: CIRCUIT_URL_MAINNET,
  },
  {
    chainId: getIdFromChain("robinhood"),
    chain: "robinhood",
    kind: "evm",
    type: "mainnet",
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    rootRegistry: "0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70",
    registryHelper: "0x0A55cA59e98e17666C1A9a099d546E676088bC1A",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_MAINNET,
    circuitUrl: CIRCUIT_URL_MAINNET,
  },
  {
    chainId: getIdFromChain("aztec"),
    chain: "aztec",
    kind: "aztec",
    type: "mainnet",
    rpcUrl: "https://aztec-mainnet.drpc.org",
    rootRegistry: "0x1478d06759c62f151751aa08e2ce8950dd49e9891c40b9a93774a4686000e8fc",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_MAINNET,
    circuitUrl: CIRCUIT_URL_MAINNET,
  },
  {
    chainId: getIdFromChain("ethereum_sepolia"),
    chain: "ethereum_sepolia",
    kind: "evm",
    type: "testnet",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G",
    rootRegistry: "0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70",
    registryHelper: "0x6Ee299B1E8049fadc3494f1110A3479f5BE8EC0e",
    // registryHelper: "0xbcc295c3f2a5398d459c81355540270d66563a61", // New RegistryHelper for canonical root registry
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_TESTNET,
    circuitUrl: CIRCUIT_URL_SEPOLIA,
  },
  {
    chainId: getIdFromChain("aztec_testnet"),
    chain: "aztec_testnet",
    kind: "aztec",
    type: "testnet",
    rpcUrl: "https://aztec-testnet.drpc.org",
    rootRegistry: "0x019de2b2c83e178733dce20707949a17ec3465caba6ccd24b3d861f151bf0f30",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_TESTNET,
    circuitUrl: CIRCUIT_URL_SEPOLIA,
  },
  {
    chainId: getIdFromChain("local"),
    chain: "local",
    kind: "evm",
    type: "dev",
    rpcUrl: "http://localhost:8545",
    rootRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    registryHelper: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    packagedCertificatesUrl: PACKAGED_CERTIFICATES_URL_DEV,
    circuitUrl: CIRCUIT_URL_DEV,
  },
]
