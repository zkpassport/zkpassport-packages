import { PackagedCertificate } from "@zkpassport/utils"
import { CountryData, GeographyObject } from "./types"

// Legend data for private key usage period coverage levels
export const COVERAGE_LEGEND_ITEMS = [
  { color: "#1D4ED8", label: "High (90-100%)" },
  { color: "#2563EB", label: "Good (70-90%)" },
  { color: "#3B82F6", label: "Partial (25-70%)" },
  { color: "#93C5FD", label: "Low (1-25%)" },
  { color: "#374151", label: "No coverage (0%)" },
] as const

// Function to get country code from geography object
export const getCountryCode = (
  geo: GeographyObject,
  data: CountryData,
  countryNameToCode: Record<string, string>,
): string | null => {
  // First try to get ISO3 code directly from properties
  const countryCode =
    geo.properties.ISO_A3 ||
    geo.properties.ISO_A3_EH ||
    geo.properties.ISO3 ||
    geo.properties.iso_a3

  // If we have a code, check if it exists in our data
  if (countryCode && typeof countryCode === "string" && data[countryCode]) {
    return countryCode
  }

  // Try to match by country name
  const countryName = geo.properties.NAME || geo.properties.name
  if (countryName && typeof countryName === "string") {
    // Check our dynamic mapping
    const codeFromName =
      countryNameToCode[countryName] || countryNameToCode[countryName.toLowerCase()]
    if (codeFromName && data[codeFromName]) {
      return codeFromName
    }
  }

  // We don't use numeric ID mapping anymore since we rely on ISO codes and country names

  return null
}

// Function to get country color based on private key usage period coverage
export const getCountryColor = (
  geo: GeographyObject,
  data: CountryData,
  countryNameToCode: Record<string, string>,
): string => {
  const countryCode = getCountryCode(geo, data, countryNameToCode)

  if (!countryCode) return "#374151" // Dark gray for countries with no data
  const countryData = data[countryCode]

  if (!countryData || countryData.support === "none") return "#374151" // Dark gray for no support

  // Use private key usage period coverage if available, otherwise fall back to certificate count
  if (countryData.privateKeyUsagePeriodCoverage) {
    const coverage = countryData.privateKeyUsagePeriodCoverage

    // Special case: percentage of -1 means no coverage calculation was possible
    if (coverage.percentage === -1) {
      return "#9ca3af" // Medium gray for unknown coverage
    }

    const percentage = coverage.percentage
    if (percentage === 0) return "#374151" // Dark gray for no coverage
    if (percentage < 25) return "#93C5FD" // Light blue for low coverage
    if (percentage < 50) return "#3B82F6" // Medium blue for medium-low coverage
    if (percentage < 75) return "#2563EB" // Dark blue for medium-high coverage
    return "#1D4ED8" // Darkest blue for high coverage
  }

  // Fallback to certificate count if no private key usage period data
  const certCount = countryData.certificateCount || 0

  if (certCount === 0) return "#374151" // Dark gray - no certificates
  if (certCount <= 1) return "#DBEAFE" // Very light blue - minimal support (1-2 certs)
  if (certCount <= 3) return "#93C5FD" // Light blue - basic support (3-5 certs)
  if (certCount <= 6) return "#60A5FA" // Medium blue - partial support (6-10 certs)
  if (certCount <= 10) return "#3B82F6" // Blue - good support (11-20 certs)
  if (certCount <= 20) return "#2563EB" // Dark blue - strong support (21-50 certs)
  return "#1D4ED8" // Very dark blue - excellent support (50+ certs)
}

// Helper function to format coverage information
export const formatCoverage = (countryInfo: CountryData[string]): string => {
  if (countryInfo.privateKeyUsagePeriodCoverage) {
    const coverage = countryInfo.privateKeyUsagePeriodCoverage

    if (coverage.percentage === -1) {
      return "No private key data available"
    }

    let coverageText = `${coverage.percentage.toFixed(1)}%`

    if (!coverage.hasPrivateKeyData) {
      coverageText += " (estimated)"
    }

    return coverageText
  } else if (countryInfo.certificateCount) {
    return `${countryInfo.certificateCount} certificates available`
  }

  return "No coverage data"
}

// Helper function to derive supported document types from certificate tags
export const getSupportedDocuments = (
  countryCode: string,
  certificatesByCountry: Record<string, PackagedCertificate[]>,
): string[] => {
  const documents = new Set<string>()

  // Default to passport as it's the primary document type for most certificates
  documents.add("Passport")

  // Check actual certificate tags for this country
  const countryCerts = certificatesByCountry[countryCode] || []
  const allTags = countryCerts.flatMap((cert) => cert.tags || [])

  // Check for specific document type indicators in tags
  allTags.forEach((tag) => {
    const tagLower = tag.toLowerCase()
    if (tagLower.includes("id") && !tagLower.includes("icao")) {
      documents.add("ID Card")
    }
  })

  return Array.from(documents)
}
