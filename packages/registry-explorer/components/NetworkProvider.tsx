"use client"

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

export interface NetworkOverrides {
  rpcUrl?: string
  rootRegistry?: string
  registryHelper?: string
}

export interface NetworkOption {
  // Unique selection key for this network option. May differ from chainId
  // when multiple options target the same chain (e.g. Testnet vs Testnet B
  // both on Sepolia but with different registry contracts).
  id: number
  // The actual EVM chain id used for RPC and contract lookups.
  chainId: number
  label: string
  shortLabel: string
  // Per-option overrides applied on top of the SDK's CHAIN_CONFIG (and any
  // env overrides for the same chain id). Use to point a network option at
  // alternate registry deployments on the same chain.
  overrides?: NetworkOverrides
}

const MAINNET: NetworkOption = { id: 1, chainId: 1, label: "Mainnet", shortLabel: "Mainnet" }
const SEPOLIA: NetworkOption = {
  id: 2,
  chainId: 11155111,
  label: "Testnet",
  shortLabel: "Testnet",
}
const MAINNET_B: NetworkOption = {
  id: 3,
  chainId: 1,
  label: "Mainnet B",
  shortLabel: "Mainnet B",
  overrides: {
    rootRegistry: "0xd083fA4Bd1fbBB5332278E026a28963Dd1097de1",
    registryHelper: "0xcf23746a767532dB2A51358bfCA3CEBFB1cC82EA",
  },
}
const TESTNET_B: NetworkOption = {
  id: 4,
  chainId: 11155111,
  label: "Testnet B",
  shortLabel: "Testnet B",
  overrides: {
    rootRegistry: "0x7bF6A8A5fD3cA008760ff91691DdEE5F0FcaCf85",
    registryHelper: "0xF7A4230eD310764427908236329Af1E04f86b0fe",
  },
}
const LOCAL: NetworkOption = { id: 31337, chainId: 31337, label: "Local", shortLabel: "Local" }

const ENV_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 0)

const BASE_NETWORKS: NetworkOption[] = [MAINNET, SEPOLIA, MAINNET_B, TESTNET_B]

function isLocalhostHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  )
}

function isRunningOnLocalhost(): boolean {
  if (typeof window === "undefined") return false
  return isLocalhostHostname(window.location.hostname)
}

function computeAvailableNetworks(onLocalhost: boolean): NetworkOption[] {
  return onLocalhost ? [...BASE_NETWORKS, LOCAL] : BASE_NETWORKS
}

const STORAGE_KEY = "network"

function getDefaultNetworkId(networks: NetworkOption[]): number {
  if (ENV_CHAIN_ID && networks.some((n) => n.id === ENV_CHAIN_ID)) {
    return ENV_CHAIN_ID
  }
  return MAINNET.id
}

interface NetworkContextType {
  // Actual EVM chain id of the currently selected network option.
  chainId: number
  // Currently selected network option (drives chainId, label, overrides).
  currentNetwork: NetworkOption
  // Select a network by its option id (NetworkOption.id).
  setNetwork: (networkId: number) => void
  availableNetworks: NetworkOption[]
  // False until the persisted network selection has been resolved from
  // localStorage on the client. Consumers that perform network-dependent
  // side effects (e.g. RPC calls) should wait until this is true to avoid
  // firing requests against a stale default chainId and racing the eventual
  // hydrated value.
  isReady: boolean
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Start with the SSR-safe network list (no Local). After hydration we
  // re-evaluate to include Local when running on localhost.
  const [availableNetworks, setAvailableNetworks] = useState<NetworkOption[]>(() =>
    computeAvailableNetworks(false),
  )
  const [networkId, setNetworkIdState] = useState<number>(() =>
    getDefaultNetworkId(computeAvailableNetworks(false)),
  )
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const networks = computeAvailableNetworks(isRunningOnLocalhost())
    setAvailableNetworks(networks)

    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
    const storedNum = stored !== null ? Number(stored) : NaN
    if (Number.isFinite(storedNum) && networks.some((n) => n.id === storedNum)) {
      setNetworkIdState(storedNum)
    } else {
      setNetworkIdState(getDefaultNetworkId(networks))
    }
    setIsReady(true)
  }, [])

  const setNetwork = useCallback(
    (next: number) => {
      if (!availableNetworks.some((n) => n.id === next)) return
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(next))
      }
      setNetworkIdState(next)
    },
    [availableNetworks],
  )

  const value = useMemo<NetworkContextType>(() => {
    const currentNetwork = availableNetworks.find((n) => n.id === networkId) ?? availableNetworks[0]
    return {
      chainId: currentNetwork.chainId,
      currentNetwork,
      setNetwork,
      availableNetworks,
      isReady,
    }
  }, [networkId, availableNetworks, setNetwork, isReady])

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
}

export function useNetwork() {
  const context = useContext(NetworkContext)
  if (context === undefined) {
    throw new Error("useNetwork must be used within a NetworkProvider")
  }
  return context
}

/**
 * Returns env-based RegistryClient overrides only when the active chain
 * matches NEXT_PUBLIC_CHAIN_ID. This preserves local Anvil overrides while
 * letting Mainnet/Sepolia rely on the SDK's built-in CHAIN_CONFIG.
 */
export function getEnvOverridesForChain(chainId: number): NetworkOverrides {
  if (!ENV_CHAIN_ID || chainId !== ENV_CHAIN_ID) return {}
  return {
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL,
    rootRegistry: process.env.NEXT_PUBLIC_ROOT_REGISTRY_ADDRESS,
    registryHelper: process.env.NEXT_PUBLIC_REGISTRY_HELPER_ADDRESS,
  }
}

/**
 * Returns the combined RegistryClient overrides for a network option:
 * env overrides (matched by chain id) merged with the option's own
 * overrides, with the option's overrides taking precedence.
 */
export function getNetworkOverrides(network: NetworkOption): NetworkOverrides {
  const envOverrides = getEnvOverridesForChain(network.chainId)
  return {
    ...envOverrides,
    ...(network.overrides ?? {}),
  }
}
