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
  // Initialize with mobile-friendly defaults
  const initialMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false

  // Get appropriate zoom level based on device
  const getDefaultZoom = (mobile: boolean) => {
    return mobile ? 0.8 : 1.5
  }

  const getDefaultCenter = (mobile: boolean): [number, number] => {
    return mobile ? [0, 0] : [20, 0]
  }

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
  const [isMobile, setIsMobile] = useState(initialMobile)
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0])
  const [mapZoom, setMapZoom] = useState(() => getDefaultZoom(initialMobile))
  const [targetCenter, setTargetCenter] = useState<[number, number]>(() =>
    getDefaultCenter(initialMobile),
  )
  const [targetZoom, setTargetZoom] = useState(() => getDefaultZoom(initialMobile))
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

  // Additional effect to handle layout changes (e.g., when country is selected)
  useEffect(() => {
    const handleLayoutChange = () => {
      const container = document.getElementById("map-container")
      if (container) {
        const rect = container.getBoundingClientRect()
        const width = Math.max(rect.width || 400, 320)
        const height = Math.max(rect.height || 300, 240)

        // Only update if dimensions have actually changed
        if (Math.abs(width - mapWidth) > 10 || Math.abs(height - mapHeight) > 10) {
          setMapWidth(width)
          setMapHeight(height)
        }
      }
    }

    // Debounced resize handler for layout changes
    const timeoutId = setTimeout(handleLayoutChange, 250)

    return () => clearTimeout(timeoutId)
  }, [data, mapWidth, mapHeight]) // Re-run when data changes or map size changes

  // Effect to handle when map becomes visible (important for mobile layout)
  useEffect(() => {
    const container = document.getElementById("map-container")
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Map is visible, ensure proper sizing
            setTimeout(() => {
              const rect = container.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) {
                const width = Math.max(rect.width, 320)
                const height = Math.max(rect.height, 240)
                setMapWidth(width)
                setMapHeight(height)
              }
            }, 100)
          }
        })
      },
      { threshold: 0.1 },
    )

    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  // Reset map view when requested
  useEffect(() => {
    if (resetMapView) {
      setTargetCenter(getDefaultCenter(isMobile))
      setTargetZoom(getDefaultZoom(isMobile))
    }
  }, [resetMapView, isMobile])

  // Set initial mobile zoom when component mounts
  useEffect(() => {
    if (isMobile) {
      setTargetZoom(getDefaultZoom(isMobile))
      setTargetCenter(getDefaultCenter(isMobile))
      setMapZoom(getDefaultZoom(isMobile))
      setMapCenter(getDefaultCenter(isMobile))
    }
  }, [isMobile])

  useEffect(() => {
    const updateMapSize = () => {
      // Get the actual container size instead of window size
      const container = document.getElementById("map-container")
      if (container) {
        const rect = container.getBoundingClientRect()
        // Ensure minimum dimensions for proper rendering
        const width = Math.max(rect.width || 400, 320)
        const height = Math.max(rect.height || 300, 240)
        setMapWidth(width)
        setMapHeight(height)

        // Debug log for mobile layout issues
        if (process.env.NODE_ENV === "development") {
          console.log("Map container dimensions:", { width, height, rect })
        }
      } else {
        // Fallback dimensions if container not found
        setMapWidth(window.innerWidth)
        setMapHeight(window.innerHeight * 0.5) // Half screen for mobile
      }

      // Detect mobile screen size
      const wasMobile = isMobile
      const nowMobile = window.innerWidth < 768
      setIsMobile(nowMobile)

      // Adjust zoom when switching between mobile and desktop
      if (wasMobile !== nowMobile) {
        const newZoom = getDefaultZoom(nowMobile)
        const newCenter = getDefaultCenter(nowMobile)
        setTargetZoom(newZoom)
        setTargetCenter(newCenter)
      }
    }

    // Initial size update with a small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateMapSize, 100)

    // Also update immediately
    updateMapSize()

    window.addEventListener("resize", updateMapSize)

    return () => {
      window.removeEventListener("resize", updateMapSize)
      clearTimeout(timeoutId)
    }
  }, [isMobile])

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

  const showCountryInfo = (geo: GeographyObject) => {
    const countryCode = getCountryCode(geo, data, countryNameToCode)
    return countryCode ? data[countryCode] : null
  }

  const handleMouseEnter = (geo: GeographyObject, event: React.MouseEvent) => {
    if (isMobile) {
      // On mobile, send hover info to sidebar instead of showing tooltip
      showCountryInfo(geo)
      return
    }

    // Desktop: show tooltip as before
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
    if (isMobile) {
      // On mobile, don't clear hover info automatically - let user interactions control it
      // This allows the hover info to persist until another country is touched
    } else {
      setShowTooltip(false)
    }
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isMobile) {
      setTooltipPosition({ x: event.clientX, y: event.clientY })
    }
  }

  // Handle touch events for mobile hover info
  const handleTouchStart = (geo: GeographyObject) => {
    if (isMobile) {
      // Show country info on touch
      showCountryInfo(geo)
    }
  }

  const handleCountryClick = (geo: GeographyObject) => {
    const countryName =
      geo.properties.NAME || geo.properties.NAME_EN || geo.properties.name || geo.properties.ADMIN

    const countryCode = getCountryCode(geo, data, countryNameToCode)

    // On mobile, show hover info when clicking (before selecting)
    if (isMobile) {
      showCountryInfo(geo)
    }

    if (countryCode && countryName) {
      // Zoom to the clicked country with smooth animation
      const centroid = geoCentroid(geo as unknown as ExtendedGeometryCollection<GeoGeometryObjects>)
      setTargetCenter(centroid as [number, number])
      // Use different zoom levels for mobile vs desktop
      setTargetZoom(isMobile ? 2.5 : 4)

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
      setTargetZoom(isMobile ? 2.5 : 4) // Use different zoom levels for mobile vs desktop
    }

    onCountryClick?.(result.code, result.name)
  }

  const handleResetView = () => {
    setTargetCenter(getDefaultCenter(isMobile))
    setTargetZoom(getDefaultZoom(isMobile))
  }

  return (
    <div id="map-container" className="relative w-full h-full overflow-hidden min-h-[240px]">
      {/* Search Bar and Controls */}
      <div className="absolute top-2 md:top-4 right-2 md:right-4 z-10 flex items-center gap-1 md:gap-2">
        {/* Reset View Button */}
        <button
          onClick={handleResetView}
          className="p-2 md:p-2 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg hover:bg-muted transition-colors touch-manipulation"
          title="Reset view"
        >
          <RotateCcw className="w-4 h-4 md:w-4 md:h-4 text-foreground" />
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
            minZoom={isMobile ? 0.8 : 0.5}
            maxZoom={isMobile ? 6 : 8}
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
                      onTouchStart={() => handleTouchStart(geo)}
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

      {/* Tooltip - only show on desktop */}
      {showTooltip && !isMobile && (
        <MapTooltip tooltipContent={tooltipContent} tooltipPosition={tooltipPosition} />
      )}

      <MapLegend />
    </div>
  )
}
