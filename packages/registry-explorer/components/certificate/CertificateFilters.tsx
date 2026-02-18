import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CertificateFilterState } from "@/lib/types"
import { countryCodeAlpha3ToName } from "@zkpassport/utils"

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
  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Search</label>
        <div className="relative rounded-md shadow-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <Input
            type="text"
            placeholder="Search by public key, SKI, AKI, or country..."
            value={filterState.searchTerm}
            onChange={(e) => onFilterChange("searchTerm", e.target.value)}
            className="pl-10 w-full focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700"
          />
        </div>
      </div>

      {/* Country + Signature Type + conditional filters on one line */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Filter by Country
          </label>
          <Select
            value={filterState.selectedCountry}
            onValueChange={(value) => onFilterChange("selectedCountry", value)}
          >
            <SelectTrigger className="w-full bg-white dark:bg-gray-700">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              <div className="max-h-[300px] overflow-y-auto">
                <SelectItem value="all" className="cursor-pointer">
                  All Countries
                </SelectItem>
                {uniqueCountries.map((country) => (
                  <SelectItem key={country} value={country} className="cursor-pointer">
                    {countryCodeAlpha3ToName(country)}
                  </SelectItem>
                ))}
              </div>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
