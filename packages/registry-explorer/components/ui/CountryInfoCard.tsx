"use client"

import React from "react"
import { ChevronRight, Globe, Plus } from "lucide-react"

interface CountryInfo {
  support: "full" | "partial" | "none"
  documentTypes: Array<"passport" | "id_card" | "residence_permit">
  dateRange?: {
    from: string
    to: string
  }
  isNew?: boolean
  hasExtendedCoverage?: boolean
  count?: number // For backward compatibility
}

export interface CountryData {
  [countryCode: string]: CountryInfo
}

interface CountryInfoCardProps {
  data: CountryData
  registryUpdateDate?: string
  onCountryClick?: (countryCode: string) => void
}

const countryCodeToName: { [key: string]: string } = {
  USA: "United States",
  GBR: "United Kingdom",
  FRA: "France",
  DEU: "Germany",
  JPN: "Japan",
  CAN: "Canada",
  AUS: "Australia",
  ITA: "Italy",
  ESP: "Spain",
  NLD: "Netherlands",
  CHE: "Switzerland",
  SWE: "Sweden",
  NOR: "Norway",
  DNK: "Denmark",
  FIN: "Finland",
  BEL: "Belgium",
  AUT: "Austria",
  IRL: "Ireland",
  NZL: "New Zealand",
  SGP: "Singapore",
  // Add more as needed
}

export default function CountryInfoCard({
  data,
  registryUpdateDate,
  onCountryClick,
}: CountryInfoCardProps) {
  // Get new countries and countries with extended coverage
  const newCountries = Object.entries(data)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([_, info]) => info.isNew)
    .map(([code, info]) => ({ code, ...info }))

  const extendedCountries = Object.entries(data)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .filter(([_, info]) => info.hasExtendedCoverage)
    .map(([code, info]) => ({ code, ...info }))

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case "passport":
        return "🛂"
      case "id_card":
        return "🪪"
      case "residence_permit":
        return "🏠"
      default:
        return "📄"
    }
  }

  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-4 w-80">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Registry Updates
        </h3>
        {registryUpdateDate && (
          <p className="text-xs text-gray-500 mt-1">
            Last updated: {new Date(registryUpdateDate).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* New Countries */}
      {newCountries.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
            <Plus className="w-4 h-4" />
            New Countries
          </h4>
          <div className="space-y-1">
            {newCountries.slice(0, 5).map(({ code, documentTypes }) => (
              <div
                key={code}
                onClick={() => onCountryClick?.(code)}
                className="flex items-center justify-between p-2 rounded hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <span className="text-sm text-gray-800">{countryCodeToName[code] || code}</span>
                <div className="flex items-center gap-1">
                  {documentTypes.map((type) => (
                    <span key={type} className="text-xs" title={type}>
                      {getDocumentTypeIcon(type)}
                    </span>
                  ))}
                  <ChevronRight className="w-3 h-3 text-gray-400 ml-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Extended Coverage */}
      {extendedCountries.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Extended Coverage</h4>
          <div className="space-y-1">
            {extendedCountries.slice(0, 5).map(({ code, documentTypes }) => (
              <div
                key={code}
                onClick={() => onCountryClick?.(code)}
                className="flex items-center justify-between p-2 rounded hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <span className="text-sm text-gray-800">{countryCodeToName[code] || code}</span>
                <div className="flex items-center gap-1">
                  {documentTypes.map((type) => (
                    <span key={type} className="text-xs" title={type}>
                      {getDocumentTypeIcon(type)}
                    </span>
                  ))}
                  <ChevronRight className="w-3 h-3 text-gray-400 ml-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {newCountries.length === 0 && extendedCountries.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No recent updates</p>
      )}
    </div>
  )
}
