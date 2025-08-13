import React, { useState, useEffect, useMemo } from "react"
import { Search } from "lucide-react"
import { countryCodeAlpha3ToName } from "@zkpassport/utils"
import { CountryData } from "@/lib/types"

interface SearchResult {
  code: string
  name: string
}

interface MapSearchProps {
  data: CountryData
  onResultClick: (result: SearchResult) => void
  className?: string
  placeholder?: string
}

const MapSearch: React.FC<MapSearchProps> = ({
  data,
  onResultClick,
  className = "",
  placeholder = "Search country...",
}) => {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showSearchResults, setShowSearchResults] = useState(false)

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
      const results: SearchResult[] = []

      // Search through country names and codes
      Object.entries(countryNames).forEach(([code, name]) => {
        if (name.toLowerCase().includes(query) || code.toLowerCase().includes(query)) {
          results.push({
            code,
            name,
          })
        }
      })

      // Sort results by name
      results.sort((a, b) => {
        const aLower = a.name.toLowerCase()
        const bLower = b.name.toLowerCase()
        const queryLower = query.toLowerCase()

        // Exact matches first
        if (aLower === queryLower) return -1
        if (bLower === queryLower) return 1

        // Then matches that start with query
        if (aLower.startsWith(queryLower) && !bLower.startsWith(queryLower)) return -1
        if (bLower.startsWith(queryLower) && !aLower.startsWith(queryLower)) return 1

        // Then alphabetical
        return aLower.localeCompare(bLower)
      })

      setSearchResults(results.slice(0, 5)) // Limit to 5 results
      setShowSearchResults(results.length > 0)
    } else {
      setSearchResults([])
      setShowSearchResults(false)
    }
  }, [searchQuery, countryNames])

  const handleResultClick = (result: SearchResult) => {
    setSearchQuery("")
    setShowSearchResults(false)
    onResultClick(result)
  }

  const handleInputBlur = () => {
    // Small delay to allow click events on results to fire
    setTimeout(() => setShowSearchResults(false), 200)
  }

  const handleInputFocus = () => {
    if (searchQuery && searchResults.length > 0) {
      setShowSearchResults(true)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onBlur={handleInputBlur}
        onFocus={handleInputFocus}
        className="w-48 sm:w-56 md:w-64 px-3 md:px-4 py-2 pl-9 md:pl-10 bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-lg text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring touch-manipulation"
      />
      <Search className="absolute left-2.5 md:left-3 top-2.5 w-4 h-4 text-muted-foreground" />

      {/* Search Results Dropdown */}
      {showSearchResults && searchResults.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-background rounded-lg shadow-xl border border-border overflow-hidden z-50">
          {searchResults.map((result) => (
            <button
              key={result.code}
              onClick={() => handleResultClick(result)}
              className="w-full px-3 md:px-4 py-3 text-left hover:bg-muted transition-colors flex items-center justify-between group touch-manipulation"
            >
              <div>
                <div className="text-sm font-medium text-foreground">{result.name}</div>
                <div className="text-xs text-muted-foreground">{result.code}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {data[result.code]?.certificateCount || 0}
                </div>
                <div className="text-xs text-muted-foreground">certificates</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default MapSearch
