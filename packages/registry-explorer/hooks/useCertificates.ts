import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { CertificateFilterState } from "@/lib/types"
import { getCountryName, isECDSA, isRSA, isRSAPSS, isRSAPKCS } from "@/lib/certificate-utils"
import { RegistryClient, RootDetails } from "@zkpassport/registry"
import type { ECPublicKey, PackagedCertificate } from "@zkpassport/utils"
import debug from "debug"

const log = debug("explorer")

export const useCertificates = () => {
  const searchParams = useSearchParams()
  const [certificates, setCertificates] = useState<PackagedCertificate[]>([])
  const [filteredCertificates, setFilteredCertificates] = useState<PackagedCertificate[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [currentRoot, setCurrentRoot] = useState<string>("")
  const [isLatestRoot, setIsLatestRoot] = useState<boolean>(true)
  const [availableRoots, setAvailableRoots] = useState<RootDetails[]>([])

  // Filter state
  const [filterState, setFilterState] = useState<CertificateFilterState>({
    searchTerm: "",
    selectedCountry: "all",
    selectedHashAlgorithm: "all",
    selectedSignatureType: "all",
    selectedRSAType: "all",
    selectedCurve: "all",
  })

  // Metadata derived from certificates
  const [uniqueCountries, setUniqueCountries] = useState<string[]>([])
  const [uniqueHashAlgorithms, setUniqueHashAlgorithms] = useState<string[]>([])
  const [uniqueCurves, setUniqueCurves] = useState<string[]>([])

  // Memoize updateFilter to prevent re-creation on every render
  const updateFilter = useCallback((key: keyof CertificateFilterState, value: string) => {
    setFilterState((prev) => ({
      ...prev,
      [key]: value,
    }))
  }, [])

  // Initialize searchTerm from URL if provided
  useEffect(() => {
    const certId = searchParams.get("id")
    if (certId) {
      setFilterState((prev) => ({
        ...prev,
        searchTerm: certId,
      }))
    }
  }, [searchParams])

  // Use the RegistryClient to fetch certificates
  useEffect(() => {
    const fetchCertificates = async () => {
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

        // Fetch all available roots
        try {
          const roots = await client.getAllHistoricalCertificateRegistryRoots()
          setAvailableRoots(roots)
        } catch (err) {
          console.error("Error fetching historical roots:", err)
          // Don't fail the whole operation if this fails
        }

        // Check if a specific root is requested from URL
        const rootFromUrl = searchParams.get("root")
        let rootToUse: string
        let sdkCertificates: PackagedCertificate[]
        const latestRoot: string = await client.getLatestCertificatesRoot()

        const validateCertificates = process.env.NODE_ENV !== "development"
        if (rootFromUrl) {
          log("Using root from URL:", rootFromUrl)
          rootToUse = rootFromUrl
          setIsLatestRoot(rootToUse === latestRoot)
          sdkCertificates = await client.getCertificatesForRoot(rootToUse, validateCertificates)
          log("Certificates loaded for root:", rootToUse)
          log(`Loaded ${sdkCertificates.length} certificates from ${rootFromUrl}`)
        } else {
          sdkCertificates = await client.getLatestCertificates(validateCertificates)
          rootToUse = latestRoot
          setIsLatestRoot(true)
        }

        setCurrentRoot(rootToUse)
        setCertificates(sdkCertificates)

        // TODO: Consider implementing a more efficient way to do this
        // Extract unique countries
        const countryList = [
          ...new Set(sdkCertificates.map((cert: PackagedCertificate) => cert.country)),
        ]

        // Sort by country name rather than code
        countryList.sort((a, b) => {
          const nameA = getCountryName(a)
          const nameB = getCountryName(b)
          return nameA.localeCompare(nameB)
        })

        // TODO: Consider implementing a more efficient way to do this
        // Extract unique hash algorithms
        const uniqueHashAlgorithms = [
          ...new Set(sdkCertificates.map((cert: PackagedCertificate) => cert.hash_algorithm)),
        ]

        // TODO: Consider implementing a more efficient way to do this
        // Extract unique ECDSA curves
        const uniqueCurvesList = [
          ...new Set(
            sdkCertificates
              .filter((cert: PackagedCertificate) => isECDSA(cert))
              .map((cert: PackagedCertificate) => (cert.public_key as ECPublicKey).curve),
          ),
        ]

        setUniqueCountries(countryList)
        setUniqueHashAlgorithms(uniqueHashAlgorithms.sort())
        setUniqueCurves(uniqueCurvesList.sort())

        // Set initial filtered certificates based on data and URL parameters
        const certId = searchParams.get("id")
        if (certId) {
          // If we have a certificate ID in the URL, attempt to find that certificate
          const certificate = sdkCertificates.find(
            (cert: PackagedCertificate) => cert.subject_key_identifier === certId,
          )

          if (certificate) {
            setFilteredCertificates([certificate])
          } else {
            setFilteredCertificates(sdkCertificates)
          }
        } else {
          setFilteredCertificates(sdkCertificates)
        }
      } catch (error) {
        console.error("Error fetching certificates:", error)
        setError(error instanceof Error ? error.message : "Unknown error occurred")
        setFilteredCertificates([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchCertificates()
  }, [searchParams]) // Only depend on searchParams since we're no longer accepting useApi parameter

  // Apply filters when filter state changes
  useEffect(() => {
    if (certificates.length === 0) return

    const filtered = certificates.filter((cert) => {
      // Filter by search term (case insensitive)
      const searchTermMatch =
        filterState.searchTerm === "" ||
        cert.subject_key_identifier?.toLowerCase().includes(filterState.searchTerm.toLowerCase()) ||
        cert.signature_algorithm.toLowerCase().includes(filterState.searchTerm.toLowerCase()) ||
        getCountryName(cert.country).toLowerCase().includes(filterState.searchTerm.toLowerCase())

      // Filter by country
      const countryMatch =
        filterState.selectedCountry === "all" || cert.country === filterState.selectedCountry

      // Filter by hash algorithm
      const hashAlgorithmMatch =
        filterState.selectedHashAlgorithm === "all" ||
        cert.hash_algorithm === filterState.selectedHashAlgorithm

      // Filter by signature type
      let signatureTypeMatch = true
      if (filterState.selectedSignatureType !== "all") {
        if (filterState.selectedSignatureType === "rsa") {
          signatureTypeMatch = isRSA(cert)
        } else if (filterState.selectedSignatureType === "ecdsa") {
          signatureTypeMatch = isECDSA(cert)
        }
      }

      // Filter by RSA type
      let rsaTypeMatch = true
      if (filterState.selectedRSAType !== "all") {
        if (filterState.selectedRSAType === "pss") {
          rsaTypeMatch = isRSAPSS(cert)
        } else if (filterState.selectedRSAType === "pkcs") {
          rsaTypeMatch = isRSAPKCS(cert)
        }
      }

      // Filter by curve
      let curveMatch = true
      if (filterState.selectedCurve !== "all") {
        // TODO: Ensure this is correct
        curveMatch = isECDSA(cert) && cert.public_key?.curve === filterState.selectedCurve
      }

      return (
        searchTermMatch &&
        countryMatch &&
        hashAlgorithmMatch &&
        signatureTypeMatch &&
        rsaTypeMatch &&
        curveMatch
      )
    })

    setFilteredCertificates(filtered)
  }, [certificates, filterState])

  return {
    certificates,
    filteredCertificates,
    isLoading,
    error,
    filterState,
    uniqueCountries,
    uniqueHashAlgorithms,
    uniqueCurves,
    updateFilter,
    currentRoot,
    isLatestRoot,
    availableRoots,
  }
}
