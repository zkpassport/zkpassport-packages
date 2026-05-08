import { getNetworkOverrides, useNetwork } from "@/components/NetworkProvider"
import { RegistryClient, RootDetails } from "@zkpassport/registry"
import debug from "debug"
import { useCallback, useEffect, useState } from "react"

const log = debug("explorer")

export function useHistoricalCircuitRoots() {
  const { chainId, currentNetwork, isReady } = useNetwork()
  const [roots, setRoots] = useState<RootDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMorePages, setHasMorePages] = useState(false)

  // Use the RegistryClient to fetch historical roots
  const fetchRoots = useCallback(async () => {
    if (!isReady) return
    setIsLoading(true)
    setError(null)

    try {
      const client = new RegistryClient({
        chainId,
        ...getNetworkOverrides(currentNetwork),
      })
      const allRoots = await client.getAllHistoricalCircuitRoots(
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
  }, [chainId, currentNetwork, isReady])

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
