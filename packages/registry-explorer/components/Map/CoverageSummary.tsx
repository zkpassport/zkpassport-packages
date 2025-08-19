import { PackagedCertificate } from "@zkpassport/utils"
import { Calendar } from "lucide-react"
import React from "react"
import { CountryData } from "../../lib/types"
import { getSupportedDocuments, formatCoverage } from "@/lib/mapUtils"

const CoverageSummary = ({
  certificatesByCountry,
  selectedCountry,
  isMobileLayout,
  countryData,
}: {
  certificatesByCountry: Record<string, PackagedCertificate[]>
  selectedCountry: { code: string; name: string }
  isMobileLayout?: boolean
  countryData?: CountryData
}) => {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {certificatesByCountry[selectedCountry.code].length}
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {" "}
              certificates in registry
            </span>
          </p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span className="text-gray-700 dark:text-gray-300">
            Coverage from{" "}
            <strong>
              {new Date(
                Math.min(
                  ...certificatesByCountry[selectedCountry.code].map(
                    (c) => c.validity.not_before * 1000,
                  ),
                ),
              ).toLocaleDateString()}
            </strong>{" "}
            to{" "}
            <strong>
              {new Date(
                Math.max(
                  ...certificatesByCountry[selectedCountry.code].map(
                    (c) => c.validity.not_after * 1000,
                  ),
                ),
              ).toLocaleDateString()}
            </strong>
          </span>
        </div>
      </div>

      {/* Supported Documents and Coverage Info (Mobile Only) */}
      {isMobileLayout && (
        <div className="mt-3 space-y-1">
          <div className="text-xs">
            <span className="font-medium text-blue-700 dark:text-blue-300">
              Supported Documents:
            </span>{" "}
            <span className="text-blue-600 dark:text-blue-400">
              {getSupportedDocuments(selectedCountry.code).join(", ")}
            </span>
          </div>
          {countryData && countryData[selectedCountry.code] && (
            <div className="text-xs">
              <span className="font-medium text-blue-700 dark:text-blue-300">Coverage:</span>{" "}
              <span className="text-blue-600 dark:text-blue-400">
                {formatCoverage(countryData[selectedCountry.code])}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default CoverageSummary
