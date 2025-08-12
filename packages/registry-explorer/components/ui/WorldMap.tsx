"use client"

import React, { useEffect, useState } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { Search } from "lucide-react"

// World map data URL (Natural Earth 110m resolution)
const geoUrl = "/countries-110m.json"

export interface CountryData {
  [countryCode: string]: {
    support: "full" | "partial" | "none"
    documentTypes: Array<"passport" | "id_card" | "residence_permit">
    dateRange?: {
      from: string
      to: string
    }
    isNew?: boolean
    hasExtendedCoverage?: boolean
    certificateCount?: number
  }
}

interface WorldMapProps {
  data?: CountryData
  onCountryClick?: (countryCode: string, countryName: string) => void
  registryUpdateDate?: string
  onCountrySearch?: (countryCode: string) => void
}

interface GeographyProperties {
  ISO_A3?: string
  NAME?: string
  name?: string
  [key: string]: unknown
}

interface GeographyObject {
  rsmKey: string
  properties: GeographyProperties
  id?: string | number
  [key: string]: unknown
}

// Map numeric country IDs to ISO3 codes
const countryIdToISO3: Record<string, string> = {
  "840": "USA",
  "124": "CAN",
  "484": "MEX",
  "076": "BRA",
  "032": "ARG",
  "152": "CHL",
  "604": "PER",
  "170": "COL",
  "862": "VEN",
  "826": "GBR",
  "250": "FRA",
  "276": "DEU",
  "380": "ITA",
  "724": "ESP",
  "620": "PRT",
  "528": "NLD",
  "056": "BEL",
  "756": "CHE",
  "040": "AUT",
  "203": "CZE",
  "616": "POL",
  "348": "HUN",
  "642": "ROU",
  "100": "BGR",
  "300": "GRC",
  "792": "TUR",
  "643": "RUS",
  "804": "UKR",
  "112": "BLR",
  "156": "CHN",
  "392": "JPN",
  "410": "KOR",
  "704": "VNM",
  "764": "THA",
  "458": "MYS",
  "360": "IDN",
  "608": "PHL",
  "702": "SGP",
  "356": "IND",
  "586": "PAK",
  "050": "BGD",
  "144": "LKA",
  "524": "NPL",
  "004": "AFG",
  "364": "IRN",
  "368": "IRA",
  "682": "SAU",
  "784": "ARE",
  "818": "EGY",
  "434": "LYB",
  "012": "DZA",
  "504": "MAR",
  "788": "TUN",
  "566": "NGA",
  "710": "ZAF",
  "404": "KEN",
  "231": "ETH",
  "800": "UGA",
  "834": "TZA",
  "024": "AGO",
  "508": "MOZ",
  "716": "ZWE",
  "894": "ZMB",
  "454": "MWI",
  "036": "AUS",
  "554": "NZL",
  "242": "FJI",
  "598": "PNG",
  "008": "ALB",
  "031": "AZE",
  "051": "ARM",
  "070": "BIH",
  "191": "HRV",
  "196": "CYP",
  "268": "GEO",
  "352": "ISL",
  "398": "KAZ",
  "417": "KGZ",
  "440": "LTU",
  "428": "LVA",
  "807": "MKD",
  "498": "MDA",
  "499": "MNE",
  "688": "SRB",
  "705": "SVN",
  "762": "TJK",
  "795": "TKM",
  "860": "UZB",
  "233": "EST",
  "246": "FIN",
  "578": "NOR",
  "752": "SWE",
  "208": "DNK",
  "372": "IRL",
  "703": "SVK",
  "442": "LUX",
  "470": "MLT",
  "020": "AND",
  "492": "MCO",
  "674": "SMR",
  "336": "VAT",
  "438": "LIE",
}

export default function WorldMap({ data = {}, onCountryClick }: WorldMapProps) {
  const [tooltipContent, setTooltipContent] = useState<string>("")
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [showTooltip, setShowTooltip] = useState(false)
  const [mapWidth, setMapWidth] = useState(800)
  const [mapHeight, setMapHeight] = useState(400)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Array<{ code: string; name: string }>>([])
  const [showSearchResults, setShowSearchResults] = useState(false)

  useEffect(() => {
    setMapWidth(window.innerWidth)
    setMapHeight(window.innerHeight)
    window.addEventListener("resize", () => {
      setMapWidth(window.innerWidth)
      setMapHeight(window.innerHeight)
    })
  }, [])

  // Country name mappings for search
  const countryNames: Record<string, string> = {
    USA: "United States",
    GBR: "United Kingdom",
    FRA: "France",
    DEU: "Germany",
    ITA: "Italy",
    ESP: "Spain",
    NLD: "Netherlands",
    BEL: "Belgium",
    CHE: "Switzerland",
    AUT: "Austria",
    POL: "Poland",
    CZE: "Czech Republic",
    SVK: "Slovakia",
    HUN: "Hungary",
    ROU: "Romania",
    BGR: "Bulgaria",
    GRC: "Greece",
    TUR: "Turkey",
    RUS: "Russia",
    UKR: "Ukraine",
    CHN: "China",
    JPN: "Japan",
    KOR: "South Korea",
    IND: "India",
    AUS: "Australia",
    NZL: "New Zealand",
    CAN: "Canada",
    MEX: "Mexico",
    BRA: "Brazil",
    ARG: "Argentina",
    ZAF: "South Africa",
    EGY: "Egypt",
    NGA: "Nigeria",
    KEN: "Kenya",
    MAR: "Morocco",
    SAU: "Saudi Arabia",
    ARE: "United Arab Emirates",
    ISR: "Israel",
    SGP: "Singapore",
    MYS: "Malaysia",
    IDN: "Indonesia",
    THA: "Thailand",
    VNM: "Vietnam",
    PHL: "Philippines",
    PAK: "Pakistan",
    BGD: "Bangladesh",
    IRN: "Iran",
    IRQ: "Iraq",
    AFG: "Afghanistan",
    NPL: "Nepal",
    LKA: "Sri Lanka",
    MMR: "Myanmar",
    PER: "Peru",
    CHL: "Chile",
    COL: "Colombia",
    VEN: "Venezuela",
    ECU: "Ecuador",
    BOL: "Bolivia",
    PRY: "Paraguay",
    URY: "Uruguay",
    PAN: "Panama",
    CRI: "Costa Rica",
    GTM: "Guatemala",
    HND: "Honduras",
    SLV: "El Salvador",
    NIC: "Nicaragua",
    DOM: "Dominican Republic",
    HTI: "Haiti",
    CUB: "Cuba",
    JAM: "Jamaica",
    PRT: "Portugal",
    IRL: "Ireland",
    DNK: "Denmark",
    NOR: "Norway",
    SWE: "Sweden",
    FIN: "Finland",
    ISL: "Iceland",
    EST: "Estonia",
    LVA: "Latvia",
    LTU: "Lithuania",
    BLR: "Belarus",
    MDA: "Moldova",
    ALB: "Albania",
    MKD: "North Macedonia",
    SRB: "Serbia",
    MNE: "Montenegro",
    HRV: "Croatia",
    SVN: "Slovenia",
    BIH: "Bosnia and Herzegovina",
    ARM: "Armenia",
    GEO: "Georgia",
    AZE: "Azerbaijan",
    KAZ: "Kazakhstan",
    UZB: "Uzbekistan",
    TKM: "Turkmenistan",
    TJK: "Tajikistan",
    KGZ: "Kyrgyzstan",
    MNG: "Mongolia",
    PRK: "North Korea",
    LAO: "Laos",
    KHM: "Cambodia",
    TWN: "Taiwan",
    HKG: "Hong Kong",
    MAC: "Macau",
  }

  // Handle search
  useEffect(() => {
    if (searchQuery.length > 0) {
      const query = searchQuery.toLowerCase()
      const results: Array<{ code: string; name: string }> = []

      // Search through country names and codes
      Object.entries(countryNames).forEach(([code, name]) => {
        if (name.toLowerCase().includes(query) || code.toLowerCase().includes(query)) {
          // Only include countries that have certificates
          if (data[code]) {
            results.push({ code, name })
          }
        }
      })

      // Also check countries in data that might not be in our mapping
      Object.keys(data).forEach((code) => {
        if (!results.find((r) => r.code === code)) {
          if (code.toLowerCase().includes(query)) {
            results.push({ code, name: code })
          }
        }
      })

      setSearchResults(results.slice(0, 5)) // Limit to 5 results
      setShowSearchResults(results.length > 0)
    } else {
      setSearchResults([])
      setShowSearchResults(false)
    }
  }, [searchQuery, data])

  // Function to get country color based on support level
  const getCountryColor = (geo: GeographyObject): string => {
    // First try to get ISO3 code directly
    let countryCode =
      geo.properties.ISO_A3 ||
      geo.properties.ISO_A3_EH ||
      geo.properties.ISO3 ||
      geo.properties.iso_a3

    // If not found, try to map from numeric ID
    if (!countryCode && geo.id) {
      countryCode = countryIdToISO3[geo.id.toString()]
    }

    if (!countryCode || typeof countryCode !== 'string') return "#374151" // Dark gray for countries with no data
    const countryData = data[countryCode] 

    if (!countryData || countryData.support === "none") return "#374151" // Dark gray for no support

    // Color based on certificate count for more granular visualization
    const certCount = countryData.certificateCount || 0

    if (certCount === 0) return "#374151" // Dark gray - no certificates
    if (certCount <= 2) return "#DBEAFE" // Very light blue - minimal support (1-2 certs)
    if (certCount <= 5) return "#93C5FD" // Light blue - basic support (3-5 certs)
    if (certCount <= 10) return "#60A5FA" // Medium blue - partial support (6-10 certs)
    if (certCount <= 20) return "#3B82F6" // Blue - good support (11-20 certs)
    if (certCount <= 50) return "#2563EB" // Dark blue - strong support (21-50 certs)
    return "#1D4ED8" // Very dark blue - excellent support (50+ certs)
  }

  const handleMouseEnter = (geo: GeographyObject, event: React.MouseEvent) => {
    const countryName =
      geo.properties.NAME || geo.properties.NAME_EN || geo.properties.name || geo.properties.ADMIN

    // Try to get ISO3 code directly
    let countryCode =
      geo.properties.ISO_A3 ||
      geo.properties.ISO_A3_EH ||
      geo.properties.ISO3 ||
      geo.properties.iso_a3

    // If not found, try to map from numeric ID
    if (!countryCode && geo.id) {
      countryCode = countryIdToISO3[geo.id.toString()]
    }

    const countryInfo = countryCode && typeof countryCode === 'string' ? data[countryCode] : null

    if (countryInfo && countryInfo.support !== "none") {
      const documentIcons = {
        passport: "🛂",
        id_card: "🪪",
        residence_permit: "🏠",
      }

      const docTypes = countryInfo.documentTypes
        .map((type: string) => documentIcons[type as keyof typeof documentIcons] || "📄")
        .join(" ")

      let tooltipText = `${countryName}`

      // Add certificate count if available
      if (countryInfo.certificateCount) {
        tooltipText += `\n${countryInfo.certificateCount} certificates`
      }

      tooltipText += `\n${docTypes}`

      if (countryInfo.dateRange) {
        const fromDate = new Date(countryInfo.dateRange.from).toLocaleDateString()
        const toDate = new Date(countryInfo.dateRange.to).toLocaleDateString()
        tooltipText += `\n${fromDate} - ${toDate}`
      }

      setTooltipContent(tooltipText)
    } else {
      setTooltipContent(countryName as string)
    }

    setTooltipPosition({ x: event.clientX, y: event.clientY })
    setShowTooltip(true)
  }

  const handleMouseLeave = () => {
    setShowTooltip(false)
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    setTooltipPosition({ x: event.clientX, y: event.clientY })
  }

  const handleCountryClick = (geo: GeographyObject) => {
    console.log("Geography properties:", geo.properties)
    console.log("Geography id:", geo.id)

    const countryName =
      geo.properties.NAME || geo.properties.NAME_EN || geo.properties.name || geo.properties.ADMIN

    // Try to get ISO3 code directly
    let countryCode =
      geo.properties.ISO_A3 ||
      geo.properties.ISO_A3_EH ||
      geo.properties.ISO3 ||
      geo.properties.iso_a3

    // If not found, try to map from numeric ID
    if (!countryCode && geo.id) {
      countryCode = countryIdToISO3[geo.id.toString()]
      console.log("Mapped from ID", geo.id, "to code:", countryCode)
    }

    console.log("Final country code:", countryCode, "name:", countryName)

    if (countryCode && countryName && typeof countryCode === 'string') {
      onCountryClick?.(countryCode, countryName as string)
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Background with gradient and animated elements */}
      <div className="absolute inset-0 bg-white">
        {/* Subtle radial overlay for depth */}
        {/* <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at center, transparent 0%, transparent 60%, rgba(0,0,0,0.2) 100%)",
          }}
        /> */}

        {/* Geographic constellation pattern */}
        <div className="absolute inset-0 opacity-5">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <g stroke="#ffffff" strokeWidth="0.5" fill="none">
              {/* Latitude lines */}
              {[...Array(9)].map((_, i) => {
                const y = (i + 1) * (100 / 10)
                return (
                  <line
                    key={`lat-${i}`}
                    x1="0%"
                    y1={`${y}%`}
                    x2="100%"
                    y2={`${y}%`}
                    strokeDasharray="5,5"
                  />
                )
              })}
              {/* Longitude lines */}
              {[...Array(11)].map((_, i) => {
                const x = (i + 1) * (100 / 12)
                return (
                  <line
                    key={`lon-${i}`}
                    x1={`${x}%`}
                    y1="0%"
                    x2={`${x}%`}
                    y2="100%"
                    strokeDasharray="5,5"
                  />
                )
              })}
            </g>
          </svg>
        </div>
      </div>

      {/* Search Bar */}
      <div className="absolute top-4 right-4 z-10">
        <div className="relative">
          <input
            type="text"
            placeholder="Search country..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
            onFocus={() => searchQuery && setShowSearchResults(true)}
            className="w-64 px-4 py-2 pl-10 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />

          {/* Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full mt-2 w-full bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
              {searchResults.map((result) => (
                <button
                  key={result.code}
                  onClick={() => {
                    onCountryClick?.(result.code, result.name)
                    setSearchQuery("")
                    setShowSearchResults(false)
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">{result.name}</div>
                    <div className="text-xs text-gray-500">{result.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-blue-600">
                      {data[result.code]?.certificateCount || 0}
                    </div>
                    <div className="text-xs text-gray-500">certificates</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map container with enhanced styling */}
      <div className="relative z-0">
        <ComposableMap projection="geoEqualEarth" width={mapWidth} height={mapHeight}>
          <ZoomableGroup zoom={1.5} center={[40, -10]} minZoom={0.5} maxZoom={8}>
            <Geographies geography={geoUrl}>
              {({ geographies }: { geographies: GeographyObject[] }) =>
                geographies.map((geo: GeographyObject) => {
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={(event: React.MouseEvent) => handleMouseEnter(geo, event)}
                      onMouseLeave={handleMouseLeave}
                      onMouseMove={handleMouseMove}
                      onClick={() => handleCountryClick(geo)}
                      style={{
                        default: {
                          fill: getCountryColor(geo),
                          stroke: "#e2e8f0",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill: (() => {
                            let code =
                              geo.properties.ISO_A3 ||
                              geo.properties.ISO_A3_EH ||
                              geo.properties.ISO3 ||
                              geo.properties.iso_a3
                            if (!code && geo.id) {
                              code = countryIdToISO3[geo.id.toString()]
                            }
                            const certCount = code && typeof code === 'string' ? (data[code]?.certificateCount || 0) : 0
                            // Darker hover colors based on certificate count
                            if (certCount === 0) return "#6b7280"
                            if (certCount <= 2) return "#93C5FD"
                            if (certCount <= 5) return "#60A5FA"
                            if (certCount <= 10) return "#3B82F6"
                            if (certCount <= 20) return "#2563EB"
                            if (certCount <= 50) return "#1D4ED8"
                            return "#1E40AF"
                          })(),
                          stroke: "#ffffff",
                          strokeWidth: 1.5,
                          outline: "none",
                          cursor: "pointer",
                          filter: "drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))",
                        },
                        pressed: {
                          fill: "#1e3a8a", // Dark blue for pressed
                          stroke: "#ffffff",
                          strokeWidth: 1.5,
                          outline: "none",
                        },
                      }}
                    />
                  )
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="fixed z-50 px-3 py-2 text-sm text-white rounded-lg shadow-xl pointer-events-none border border-blue-400/20 backdrop-blur-sm"
          style={{
            backgroundColor: "rgba(30, 64, 175, 0.95)",
            left: tooltipPosition.x + 15,
            top: tooltipPosition.y - 30,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3), 0 0 20px rgba(59, 130, 246, 0.3)",
          }}
        >
          <div className="whitespace-pre-line">{tooltipContent}</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Certificate Coverage</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#1D4ED8" }}></div>
            <span className="text-xs text-gray-700">Excellent (50+ certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#2563EB" }}></div>
            <span className="text-xs text-gray-700">Strong (21-50 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#3B82F6" }}></div>
            <span className="text-xs text-gray-700">Good (11-20 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#60A5FA" }}></div>
            <span className="text-xs text-gray-700">Partial (6-10 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#93C5FD" }}></div>
            <span className="text-xs text-gray-700">Basic (3-5 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#DBEAFE" }}></div>
            <span className="text-xs text-gray-700">Minimal (1-2 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#374151" }}></div>
            <span className="text-xs text-gray-700">No coverage</span>
          </div>
        </div>
      </div>
    </div>
  )
}
