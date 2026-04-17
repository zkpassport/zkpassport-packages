import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { CertificateFilterState } from "@/lib/types"
import { countryCodeAlpha3ToName } from "@zkpassport/utils"
import { useMemo } from "react"
import { SearchIcon } from "./StatsCardIcons"

interface CertificateFiltersProps {
  filterState: CertificateFilterState
  uniqueCountries: string[]
  // uniqueHashAlgorithms: string[]
  uniqueCurves: string[]
  onFilterChange: (key: keyof CertificateFilterState, value: string) => void
}

export function CertificateFilters({
  filterState,
  uniqueCountries,
  // uniqueHashAlgorithms,
  uniqueCurves,
  onFilterChange,
}: CertificateFiltersProps) {
  const countryOptions = useMemo(
    () => [
      { value: "all", label: "All Countries" },
      ...uniqueCountries
        .map((country) => ({
          value: country,
          label: countryCodeAlpha3ToName(country) ?? country,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [uniqueCountries],
  )

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Search
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SearchIcon className="h-4 w-4 text-gray-400" strokeWidth={1.5} />
          </div>
          <Input
            type="text"
            placeholder="Search by country, SKI, or public key..."
            value={filterState.searchTerm}
            onChange={(e) => onFilterChange("searchTerm", e.target.value)}
            className="pl-10 w-full focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700"
          />
        </div>
      </div>

      {/* Country + Signature Type + conditional filters on one line */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Country
          </label>
          <SearchableSelect
            value={filterState.selectedCountry}
            onValueChange={(value) => onFilterChange("selectedCountry", value)}
            options={countryOptions}
            placeholder="Select country"
            searchPlaceholder="Search countries..."
            emptyMessage="No countries found."
            className="bg-white dark:bg-gray-700"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Signature Type
          </label>
          <Select
            value={filterState.selectedSignatureType}
            onValueChange={(value) => onFilterChange("selectedSignatureType", value)}
          >
            <SelectTrigger className="w-full bg-white dark:bg-gray-700">
              <SelectValue placeholder="Select signature type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="cursor-pointer">
                All Types
              </SelectItem>
              <SelectItem value="rsa" className="cursor-pointer">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-blue-400 mr-2"></span>
                  RSA
                </div>
              </SelectItem>
              <SelectItem value="ecdsa" className="cursor-pointer">
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2"></span>
                  ECDSA
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filterState.selectedSignatureType === "rsa" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              RSA Type
            </label>
            <Select
              value={filterState.selectedRSAType}
              onValueChange={(value) => onFilterChange("selectedRSAType", value)}
            >
              <SelectTrigger className="w-full bg-white dark:bg-gray-700">
                <SelectValue placeholder="Select RSA type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">
                  All RSA Types
                </SelectItem>
                <SelectItem value="pss" className="cursor-pointer">
                  RSA-PSS
                </SelectItem>
                <SelectItem value="pkcs" className="cursor-pointer">
                  RSA-PKCS
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {filterState.selectedSignatureType === "ecdsa" && (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Curve
            </label>
            <Select
              value={filterState.selectedCurve}
              onValueChange={(value) => onFilterChange("selectedCurve", value)}
            >
              <SelectTrigger className="w-full bg-white dark:bg-gray-700">
                <SelectValue placeholder="Select curve" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="cursor-pointer">
                  All Curves
                </SelectItem>
                {uniqueCurves.map((curve) => (
                  <SelectItem key={curve} value={curve} className="cursor-pointer">
                    {curve}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  )
}
