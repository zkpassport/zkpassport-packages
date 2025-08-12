"use client"

import React, { useEffect, useState, useMemo, useRef } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { Search, RotateCcw } from "lucide-react"
import { countryCodeAlpha3ToName } from "@zkpassport/utils"
import { ExtendedGeometryCollection, geoCentroid, GeoGeometryObjects } from "d3-geo"

// World map data URL (Natural Earth 110m resolution)
const geoUrl = "/countries-110m.json"

export interface CountryData {
  [countryCode: string]: {
    support: "full" | "partial" | "none"
    dateRange?: {
      from: string
      to: string
    }
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

export default function WorldMap({ data = {}, onCountryClick }: WorldMapProps) {
  const [tooltipContent, setTooltipContent] = useState<string>("")
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [showTooltip, setShowTooltip] = useState(false)
  const [mapWidth, setMapWidth] = useState(800)
  const [mapHeight, setMapHeight] = useState(400)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Array<{ code: string; name: string }>>([])
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [mapCenter, setMapCenter] = useState<[number, number]>([20, 0])
  const [mapZoom, setMapZoom] = useState(1.5)
  const [targetCenter, setTargetCenter] = useState<[number, number]>([20, 0])
  const [targetZoom, setTargetZoom] = useState(1.5)
  const geographiesRef = useRef<GeographyObject[]>([])
  const animationRef = useRef<number | null>(null)

  // Smooth animation effect
  useEffect(() => {
    const animate = () => {
      const centerDiff = [targetCenter[0] - mapCenter[0], targetCenter[1] - mapCenter[1]]
      const zoomDiff = targetZoom - mapZoom

      // If we're close enough, stop animating
      if (
        Math.abs(centerDiff[0]) < 0.01 &&
        Math.abs(centerDiff[1]) < 0.01 &&
        Math.abs(zoomDiff) < 0.01
      ) {
        setMapCenter(targetCenter)
        setMapZoom(targetZoom)
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
          animationRef.current = null
        }
        return
      }

      // Smooth interpolation using easing
      const easing = 0.1 // Adjust for faster/slower animation
      setMapCenter([mapCenter[0] + centerDiff[0] * easing, mapCenter[1] + centerDiff[1] * easing])
      setMapZoom(mapZoom + zoomDiff * easing)

      animationRef.current = requestAnimationFrame(animate)
    }

    // Start animation if target differs from current
    if (
      targetCenter[0] !== mapCenter[0] ||
      targetCenter[1] !== mapCenter[1] ||
      targetZoom !== mapZoom
    ) {
      animationRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [targetCenter, targetZoom, mapCenter, mapZoom])

  useEffect(() => {
    const updateMapSize = () => {
      // Get the actual container size instead of window size
      const container = document.getElementById("map-container")
      if (container) {
        setMapWidth(container.clientWidth)
        setMapHeight(container.clientHeight)
      }
    }

    updateMapSize()
    window.addEventListener("resize", updateMapSize)

    return () => window.removeEventListener("resize", updateMapSize)
  }, [])

  // Build dynamic country name to code mapping from certificate data
  const countryNameToCode = useMemo(() => {
    const mapping: Record<string, string> = {}

    // Get all country codes from the data
    Object.keys(data).forEach((code) => {
      const countryName = countryCodeAlpha3ToName(code)
      if (countryName && countryName !== code) {
        // Store multiple variations of the country name for better matching
        mapping[countryName] = code
        mapping[countryName.toLowerCase()] = code

        // Handle special cases
        if (countryName === "United States") {
          mapping["United States of America"] = code
          mapping["united states of america"] = code
        }
        if (countryName === "United Kingdom") {
          mapping["UK"] = code
          mapping["uk"] = code
        }
        if (countryName === "Democratic Republic of the Congo") {
          mapping["Dem. Rep. Congo"] = code
          mapping["dem. rep. congo"] = code
        }
        if (countryName === "Central African Republic") {
          mapping["Central African Rep."] = code
          mapping["central african rep."] = code
        }
      }
    })

    return mapping
  }, [data])

  // Build country names for search from the certificate data
  const countryNames = useMemo(() => {
    const names: Record<string, string> = {}
    Object.keys(data).forEach((code) => {
      names[code] = countryCodeAlpha3ToName(code)
    })
    return names
  }, [data])

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
  }, [searchQuery, data, countryNames])

  // Function to get country code from geography object
  const getCountryCode = (geo: GeographyObject): string | null => {
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
  const getCountryColor = (geo: GeographyObject): string => {
    const countryCode = getCountryCode(geo)

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

  const handleMouseEnter = (geo: GeographyObject, event: React.MouseEvent) => {
    const countryName =
      geo.properties.NAME || geo.properties.NAME_EN || geo.properties.name || geo.properties.ADMIN

    const countryCode = getCountryCode(geo)
    const countryInfo = countryCode ? data[countryCode] : null

    if (countryInfo && countryInfo.support !== "none") {
      let tooltipText = `${countryName}`

      // Add certificate count if available
      if (countryInfo.certificateCount) {
        tooltipText += `\n${countryInfo.certificateCount} certificates`
      }

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
    const countryName =
      geo.properties.NAME || geo.properties.NAME_EN || geo.properties.name || geo.properties.ADMIN

    const countryCode = getCountryCode(geo)

    if (countryCode && countryName) {
      // Zoom to the clicked country with smooth animation
      const centroid = geoCentroid(geo as unknown as ExtendedGeometryCollection<GeoGeometryObjects>)
      setTargetCenter(centroid as [number, number])
      setTargetZoom(4)

      onCountryClick?.(countryCode, countryName as string)
    }
  }

  return (
    <div id="map-container" className="relative w-full h-full overflow-hidden">
      {/* Background with gradient and animated elements */}
      <div className="absolute inset-0 bg-white">
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

      {/* Search Bar and Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Reset View Button */}
        <button
          onClick={() => {
            setTargetCenter([20, 0])
            setTargetZoom(1.5)
          }}
          className="p-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
          title="Reset view"
        >
          <RotateCcw className="w-4 h-4 text-gray-600" />
        </button>

        {/* Search Bar */}
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
                    // Find the geography for this country and zoom to it
                    const geo = geographiesRef.current.find((g) => {
                      const geoCode = getCountryCode(g)
                      return geoCode === result.code
                    })

                    if (geo) {
                      // Calculate the center of the country with smooth animation
                      const centroid = geoCentroid(
                        geo as unknown as ExtendedGeometryCollection<GeoGeometryObjects>,
                      )
                      setTargetCenter(centroid as [number, number])
                      setTargetZoom(4) // Zoom in when country is selected
                    }

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
      <div className="relative z-0 w-full h-full">
        <ComposableMap
          projection="geoEqualEarth"
          width={mapWidth}
          height={mapHeight}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup
            zoom={mapZoom}
            center={mapCenter}
            minZoom={0.5}
            maxZoom={8}
            onMoveEnd={(event) => {
              // Update both current and target when user manually interacts
              setMapCenter(event.coordinates)
              setMapZoom(event.zoom)
              setTargetCenter(event.coordinates)
              setTargetZoom(event.zoom)
            }}
          >
            <Geographies geography={geoUrl}>
              {({ geographies }: { geographies: GeographyObject[] }) => {
                // Store geographies for search functionality
                geographiesRef.current = geographies
                return geographies.map((geo: GeographyObject) => {
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
                            const code = getCountryCode(geo)
                            const certCount = code ? data[code]?.certificateCount || 0 : 0
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
              }}
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
            <span className="text-xs text-gray-700">Excellent (20+ certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#2563EB" }}></div>
            <span className="text-xs text-gray-700">Strong (11-20 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#3B82F6" }}></div>
            <span className="text-xs text-gray-700">Good (6-10 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#60A5FA" }}></div>
            <span className="text-xs text-gray-700">Partial (3-5 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#93C5FD" }}></div>
            <span className="text-xs text-gray-700">Basic (1-2 certificates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: "#DBEAFE" }}></div>
            <span className="text-xs text-gray-700">Minimal (0-1 certificates)</span>
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
