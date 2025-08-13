"use client"

import React, { useEffect, useState, useMemo, useRef } from "react"
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps"
import { RotateCcw } from "lucide-react"
import { countryCodeAlpha3ToName } from "@zkpassport/utils"
import { ExtendedGeometryCollection, geoCentroid, GeoGeometryObjects } from "d3-geo"
import { GeographyObject, WorldMapProps } from "@/lib/types"
import {
  formatCoverage,
  getCountryCode,
  getCountryColor,
  getSupportedDocuments,
} from "@/lib/mapUtils"
import { MapTooltip, MapLegend, MapSearch } from "./index"
import type { TooltipContent } from "./MapTooltip"

// World map data URL (Natural Earth 110m resolution)
const geoUrl = "/countries-110m.json"

export default function WorldMap({ data = {}, onCountryClick, resetMapView }: WorldMapProps) {
  const [tooltipContent, setTooltipContent] = useState<TooltipContent>({
    title: "",
    supportedDocuments: [],
    coverage: "",
    certificateCount: 0,
  })
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [showTooltip, setShowTooltip] = useState(false)
  const [mapWidth, setMapWidth] = useState(800)
  const [mapHeight, setMapHeight] = useState(400)
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0])
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

  // Reset map view when requested
  useEffect(() => {
    if (resetMapView) {
      setTargetCenter([20, 0])
      setTargetZoom(1.5)
    }
  }, [resetMapView])

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

  const handleMouseEnter = (geo: GeographyObject, event: React.MouseEvent) => {
    const countryName =
      geo.properties.NAME || geo.properties.NAME_EN || geo.properties.name || geo.properties.ADMIN

    const countryCode = getCountryCode(geo, data, countryNameToCode)
    const countryInfo = countryCode ? data[countryCode] : null

    if (countryInfo && countryInfo.support !== "none" && countryCode) {
      const supportedDocuments = getSupportedDocuments(countryCode)
      const coverage = formatCoverage(countryInfo)

      setTooltipContent({
        title: countryName as string,
        supportedDocuments: supportedDocuments,
        coverage: coverage,
        certificateCount: countryInfo.certificateCount || 0,
        hasRecentUpdate: countryInfo.hasRecentUpdate,
      })
    } else {
      setTooltipContent({
        title: countryName as string,
        supportedDocuments: [],
        coverage: "No data available",
        certificateCount: 0,
      })
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

    const countryCode = getCountryCode(geo, data, countryNameToCode)

    if (countryCode && countryName) {
      // Zoom to the clicked country with smooth animation
      const centroid = geoCentroid(geo as unknown as ExtendedGeometryCollection<GeoGeometryObjects>)
      setTargetCenter(centroid as [number, number])
      setTargetZoom(4)

      onCountryClick?.(countryCode, countryName as string)
    }
  }

  const handleSearchResultClick = (result: { code: string; name: string }) => {
    // Find the geography for this country and zoom to it
    const geo = geographiesRef.current.find((g) => {
      const geoCode = getCountryCode(g, data, countryNameToCode)
      return geoCode === result.code
    })

    if (geo) {
      // Calculate the center of the country with smooth animation
      const centroid = geoCentroid(geo as unknown as ExtendedGeometryCollection<GeoGeometryObjects>)
      setTargetCenter(centroid as [number, number])
      setTargetZoom(4) // Zoom in when country is selected
    }

    onCountryClick?.(result.code, result.name)
  }

  const handleResetView = () => {
    setTargetCenter([0, 0])
    setTargetZoom(1.5)
  }

  return (
    <div id="map-container" className="relative w-full h-full overflow-hidden">
      {/* Search Bar and Controls */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        {/* Reset View Button */}
        <button
          onClick={handleResetView}
          className="p-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
          title="Reset view"
        >
          <RotateCcw className="w-4 h-4 text-gray-600" />
        </button>

        <MapSearch data={data} onResultClick={handleSearchResultClick} />
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
                          fill: getCountryColor(geo, data, countryNameToCode),
                          stroke: "#e2e8f0",
                          strokeWidth: 0.5,
                          outline: "none",
                        },
                        hover: {
                          fill: (() => {
                            const code = getCountryCode(geo, data, countryNameToCode)
                            const countryData = code ? data[code] : null

                            if (!countryData) return "#6b7280"

                            // Check if country has recent update - if so, use purple
                            if (countryData.hasRecentUpdate) {
                              return "#7c3aed" // Lighter purple for hover
                            }

                            // Use private key usage period coverage for hover colors
                            if (countryData.privateKeyUsagePeriodCoverage) {
                              const percentage =
                                countryData.privateKeyUsagePeriodCoverage.percentage
                              if (percentage === -1) return "#9ca3af" // Unknown coverage
                              if (percentage === 0) return "#6b7280"
                              if (percentage < 25) return "#60A5FA"
                              if (percentage < 70) return "#2563EB"
                              if (percentage < 90) return "#1D4ED8"
                              return "#1E40AF"
                            }

                            // Fallback to certificate count
                            const certCount = countryData.certificateCount || 0
                            if (certCount === 0) return "#6b7280"
                            if (certCount <= 1) return "#93C5FD"
                            if (certCount <= 2) return "#60A5FA"
                            if (certCount <= 3) return "#3B82F6"
                            if (certCount <= 4) return "#2563EB"
                            if (certCount <= 5) return "#1D4ED8"
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
        <MapTooltip tooltipContent={tooltipContent} tooltipPosition={tooltipPosition} />
      )}

      <MapLegend />
    </div>
  )
}
