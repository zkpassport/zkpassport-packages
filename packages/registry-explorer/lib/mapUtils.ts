import { CountryData, GeographyObject } from "./types"

// Legend data for certificate coverage levels
export const CERTIFICATE_LEGEND_ITEMS = [
  { color: "#1D4ED8", label: "Excellent (20+ certificates)" },
  { color: "#2563EB", label: "Strong (11-20 certificates)" },
  { color: "#3B82F6", label: "Good (6-10 certificates)" },
  { color: "#60A5FA", label: "Partial (3-5 certificates)" },
  { color: "#93C5FD", label: "Basic (1-2 certificates)" },
  { color: "#DBEAFE", label: "Minimal (0-1 certificates)" },
  { color: "#374151", label: "No coverage" },
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

// Function to get country color based on support level
export const getCountryColor = (
  geo: GeographyObject,
  data: CountryData,
  countryNameToCode: Record<string, string>,
): string => {
  const countryCode = getCountryCode(geo, data, countryNameToCode)

  if (!countryCode) return "#374151" // Dark gray for countries with no data
  const countryData = data[countryCode]

  if (!countryData || countryData.support === "none") return "#374151" // Dark gray for no support

  // Color based on certificate count for more granular visualization
  const certCount = countryData.certificateCount || 0

  if (certCount === 0) return "#374151" // Dark gray - no certificates
  if (certCount <= 1) return "#DBEAFE" // Very light blue - minimal support (1-2 certs)
  if (certCount <= 3) return "#93C5FD" // Light blue - basic support (3-5 certs)
  if (certCount <= 6) return "#60A5FA" // Medium blue - partial support (6-10 certs)
  if (certCount <= 10) return "#3B82F6" // Blue - good support (11-20 certs)
  if (certCount <= 20) return "#2563EB" // Dark blue - strong support (21-50 certs)
  return "#1D4ED8" // Very dark blue - excellent support (50+ certs)
}
