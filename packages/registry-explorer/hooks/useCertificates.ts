import { isECDSA, isRSA, isRSAPKCS, isRSAPSS } from "@/lib/certificate-utils"
import { CertificateFilterState } from "@/lib/types"
import { RegistryClient, RootDetails } from "@zkpassport/registry"
import type { ECPublicKey, PackagedCertificate } from "@zkpassport/utils"
import { countryCodeAlpha3ToName } from "@zkpassport/utils/country"
import debug from "debug"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

const log = debug("explorer")

export const useCertificates = () => {
  const router = useRouter()
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
  const updateFilter = useCallback(
    (key: keyof CertificateFilterState, value: string) => {
      setFilterState((prev) => ({
        ...prev,
        [key]: value,
      }))

      // Update URL when filter changes
      if (key === "selectedCountry") {
        const newSearchParams = new URLSearchParams(searchParams.toString())

        if (value === "all") {
          newSearchParams.delete("country")
        } else {
          newSearchParams.set("country", value)
        }

        // Preserve other params
        const newUrl = newSearchParams.toString()
          ? `?${newSearchParams.toString()}`
          : "/certificates"
        router.push(`/certificates${newUrl === "/certificates" ? "" : newUrl}`)
      }
    },
    [searchParams, router],
  )

  // Initialize filters from URL parameters
  useEffect(() => {
    const certId = searchParams.get("id")
    const countryParam = searchParams.get("country")

    setFilterState((prev) => ({
      ...prev,
      searchTerm: certId || "",
      selectedCountry: countryParam || "all",
    }))
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
          const roots = await client.getAllHistoricalCertificateRoots()
          setAvailableRoots(roots)
        } catch (err) {
          console.error("Error fetching historical roots:", err)
          // Don't fail the whole operation if this fails
        }

        // Only validate certificates in production
        const validate = false //process.env.NODE_ENV !== "development"

        const rootFromUrl = searchParams.get("root")
        const latestRoot = await client.getLatestCertificateRoot()
        const rootToUse = rootFromUrl ?? latestRoot
        log(`Getting certificates for ${rootFromUrl ? "" : "latest "}root: ${rootToUse}`)
        setIsLatestRoot(rootToUse === latestRoot)
        const { certificates: packagedCerts } = await client.getCertificates(rootToUse, {
          validate,
        })
        log(
          `Got ${packagedCerts.length} certificates for ${rootFromUrl ? "" : "latest "}root: ${rootToUse}`,
        )
        setCurrentRoot(rootToUse)
        setCertificates(packagedCerts)

        // TODO: Consider implementing a more efficient way to do this
        // Extract unique countries
        const countryList = [
          ...new Set(packagedCerts.map((cert: PackagedCertificate) => cert.country)),
        ] as string[]

        // Sort by country name rather than code
        countryList.sort((a, b) => {
          const nameA = countryCodeAlpha3ToName(a)
          const nameB = countryCodeAlpha3ToName(b)
          return nameA.localeCompare(nameB)
        }) as string[]

        // TODO: Consider implementing a more efficient way to do this
        // Extract unique hash algorithms
        const uniqueHashAlgorithms = [
          ...new Set(packagedCerts.map((cert: PackagedCertificate) => cert.hash_algorithm)),
        ] as string[]

        // TODO: Consider implementing a more efficient way to do this
        // Extract unique ECDSA curves
        const uniqueCurvesList = [
          ...new Set(
            packagedCerts
              .filter((cert: PackagedCertificate) => isECDSA(cert))
              .map((cert: PackagedCertificate) => (cert.public_key as ECPublicKey).curve),
          ),
        ] as string[]

        setUniqueCountries(countryList)
        setUniqueHashAlgorithms(uniqueHashAlgorithms.sort())
        setUniqueCurves(uniqueCurvesList.sort())

        // Set initial filtered certificates based on data and URL parameters
        const certId = searchParams.get("id")
        if (certId) {
          // If we have a certificate ID in the URL, attempt to find that certificate
          const certificate = packagedCerts.find(
            (cert: PackagedCertificate) => cert.subject_key_identifier === certId,
          )

          if (certificate) {
            setFilteredCertificates([certificate])
          } else {
            setFilteredCertificates(packagedCerts)
          }
        } else {
          setFilteredCertificates(packagedCerts)
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
        countryCodeAlpha3ToName(cert.country)
          .toLowerCase()
          .includes(filterState.searchTerm.toLowerCase())

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
