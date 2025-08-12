import { PackagedCertificate } from "@zkpassport/utils"
import { Calendar } from "lucide-react"
import React from "react"

const CoverageSummary = ({
  certificatesByCountry,
  selectedCountry,
}: {
  certificatesByCountry: Record<string, PackagedCertificate[]>
  selectedCountry: { code: string; name: string }
}) => {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-2xl font-bold text-blue-900">
            {certificatesByCountry[selectedCountry.code].length}
            <span className="text-sm text-blue-700"> certificates in registry</span>
          </p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="text-gray-700">
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
    </div>
  )
}

export default CoverageSummary
