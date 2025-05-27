import { RegistryClient, RootDetails } from "@zkpassport/registry"
import debug from "debug"
import { useEffect, useState } from "react"

const log = debug("explorer:registry-info")

export interface RegistryInfo {
  rootRegistryAddress?: string
  certificateRegistryAddress?: string
  circuitRegistryAddress?: string
  latestCertificateRoot?: string
  latestCircuitRoot?: string
  latestCertificateRootDetails?: RootDetails
  latestCircuitRootDetails?: RootDetails
  isLoading: boolean
  error: string | null
}

export const useRegistryInfo = () => {
  const [registryInfo, setRegistryInfo] = useState<RegistryInfo>({
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    const fetchRegistryInfo = async () => {
      try {
        // Create a registry client instance
        const client = new RegistryClient({
          chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337),
          rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL,
          rootRegistry: process.env.NEXT_PUBLIC_ROOT_REGISTRY_ADDRESS,
          registryHelper: process.env.NEXT_PUBLIC_REGISTRY_HELPER_ADDRESS,
        })

        // Initialize with basic info
        const info: RegistryInfo = {
          rootRegistryAddress: client.getRootRegistryAddress(),
          isLoading: false,
          error: null,
        }

        // Try to get certificate registry address
        try {
          const certificateRegistryAddress = await client.getCertificateRegistryAddress()
          info.certificateRegistryAddress = certificateRegistryAddress
        } catch (err) {
          log("Error fetching certificate registry address:", err)
        }

        // Try to get circuit registry address
        try {
          const circuitRegistryAddress = await client.getCircuitRegistryAddress()
          info.circuitRegistryAddress = circuitRegistryAddress
        } catch (err) {
          log("Error fetching circuit registry address:", err)
        }

        // Get latest certificate root
        try {
          const latestCertificateRoot = await client.getLatestCertificateRoot()
          info.latestCertificateRoot = latestCertificateRoot
          // Get latest certificate root details
          try {
            const latestCertificateRootDetails = await client.getCertificateRootDetails()
            info.latestCertificateRootDetails = latestCertificateRootDetails
          } catch (err) {
            log("Error fetching latest certificate root details:", err)
          }
        } catch (err) {
          log("Error fetching latest certificate root:", err)
        }

        // Get latest circuit root
        try {
          const latestCircuitRoot = await client.getLatestCircuitRoot()
          info.latestCircuitRoot = latestCircuitRoot
          // Get latest circuit root details
          try {
            const latestCircuitRootDetails = await client.getCircuitRootDetails()
            info.latestCircuitRootDetails = latestCircuitRootDetails
          } catch (err) {
            log("Error fetching latest circuit root details:", err)
          }
        } catch (err) {
          log("Error fetching latest circuit root:", err)
        }

        setRegistryInfo(info)
      } catch (error) {
        log("Error fetching registry info:", error)
        setRegistryInfo((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        }))
      }
    }

    fetchRegistryInfo()
  }, [])

  return registryInfo
}
