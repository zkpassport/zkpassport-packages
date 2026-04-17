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

export interface NetworkOption {
  id: number
  label: string
  shortLabel: string
}

const MAINNET: NetworkOption = { id: 1, label: "Mainnet", shortLabel: "Mainnet" }
const SEPOLIA: NetworkOption = { id: 11155111, label: "Testnet", shortLabel: "Testnet" }
const LOCAL: NetworkOption = { id: 31337, label: "Local", shortLabel: "Local" }

const ENV_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 0)

const BASE_NETWORKS: NetworkOption[] = [MAINNET, SEPOLIA]

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

function getDefaultChainId(networks: NetworkOption[]): number {
  if (ENV_CHAIN_ID && networks.some((n) => n.id === ENV_CHAIN_ID)) {
    return ENV_CHAIN_ID
  }
  return MAINNET.id
}

interface NetworkContextType {
  chainId: number
  setChainId: (chainId: number) => void
  availableNetworks: NetworkOption[]
  currentNetwork: NetworkOption
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  // Start with the SSR-safe network list (no Local). After hydration we
  // re-evaluate to include Local when running on localhost.
  const [availableNetworks, setAvailableNetworks] = useState<NetworkOption[]>(() =>
    computeAvailableNetworks(false),
  )
  const [chainId, setChainIdState] = useState<number>(() =>
    getDefaultChainId(computeAvailableNetworks(false)),
  )

  useEffect(() => {
    const networks = computeAvailableNetworks(isRunningOnLocalhost())
    setAvailableNetworks(networks)

    const stored = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
    const storedNum = stored !== null ? Number(stored) : NaN
    if (Number.isFinite(storedNum) && networks.some((n) => n.id === storedNum)) {
      setChainIdState(storedNum)
      return
    }
    // Fall back to env default (which may now include Local on localhost)
    setChainIdState(getDefaultChainId(networks))
  }, [])

  const setChainId = useCallback(
    (next: number) => {
      if (!availableNetworks.some((n) => n.id === next)) return
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(next))
      }
      setChainIdState(next)
    },
    [availableNetworks],
  )

  const value = useMemo<NetworkContextType>(() => {
    const currentNetwork = availableNetworks.find((n) => n.id === chainId) ?? availableNetworks[0]
    return {
      chainId,
      setChainId,
      availableNetworks,
      currentNetwork,
    }
  }, [chainId, availableNetworks, setChainId])

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
export function getEnvOverridesForChain(chainId: number): {
  rpcUrl?: string
  rootRegistry?: string
  registryHelper?: string
} {
  if (!ENV_CHAIN_ID || chainId !== ENV_CHAIN_ID) return {}
  return {
    rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL,
    rootRegistry: process.env.NEXT_PUBLIC_ROOT_REGISTRY_ADDRESS,
    registryHelper: process.env.NEXT_PUBLIC_REGISTRY_HELPER_ADDRESS,
  }
}
