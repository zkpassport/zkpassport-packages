import { useState, useEffect, useCallback } from "react"
import { RegistryClient, RootDetails } from "@zkpassport/registry"
import debug from "debug"

const log = debug("explorer")

export function useHistoricalRoots() {
  const [roots, setRoots] = useState<RootDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMorePages, setHasMorePages] = useState(false)

  // Use the RegistryClient to fetch historical roots
  const fetchRoots = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Create a registry client instance
      const client = new RegistryClient({
        chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337),
        rpcUrl: process.env.NEXT_PUBLIC_ETH_RPC_URL,
        rootRegistry: process.env.NEXT_PUBLIC_ROOT_REGISTRY_ADDRESS,
        registryHelper: process.env.NEXT_PUBLIC_REGISTRY_HELPER_ADDRESS,
      })
      const allRoots = await client.getAllHistoricalCertificateRegistryRoots(
        100,
        // Handle progress updates if needed
        (pageNumber: number, pageRoots: RootDetails[], totalRoots: number, isLastPage: boolean) => {
          log(`Fetched page ${pageNumber} with ${pageRoots.length} roots, total: ${totalRoots}`)
          setHasMorePages(!isLastPage)
        },
      )
      allRoots.reverse()

      setRoots(allRoots)
      setHasMorePages(false)
    } catch (err) {
      console.error("Error fetching historical roots:", err)
      if (err instanceof Error && err.message.includes("Failed to fetch")) {
        return setError("Failed fetching historical roots from registry")
      }
      setError(err instanceof Error ? err.message : "Unknown error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load the roots on component mount
  useEffect(() => {
    fetchRoots()
  }, [fetchRoots])

  // Function to manually refresh the roots
  const refreshRoots = useCallback(() => {
    fetchRoots()
  }, [fetchRoots])

  return {
    roots,
    isLoading,
    error,
    hasMorePages,
    refreshRoots,
  }
}
