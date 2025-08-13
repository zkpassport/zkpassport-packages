"use client"

import { X } from "lucide-react"

interface CoverageInfoModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function CoverageInfoModal({ isOpen, onClose }: CoverageInfoModalProps) {
  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">How Coverage is Calculated</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium mb-2">What the Map Shows</h3>
            <p className="text-gray-600 mb-4">
              The map displays how well each country is covered by the cryptographic keys that
              (ZKPassport has in its certificate registry) used to validate passports. It also shows
              whether those keys have been available continuosly over the{" "}
              <span className="font-bold">past 10 years</span>.
            </p>
            <p className="text-gray-600 mb-4">
              Why 10 years? That&apos;s the typical maximum validity period for most passports. If
              keys are missing for any part of that window, some passports from those years may not
              be verifiable.
            </p>
          </div>

          <div>
            <h4 className="font-medium mb-2">How We Measure Coverage</h4>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>
                  We look at the last 10 years (matching the normal passport validity period)
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>For each certificate, we check when its signing key was active</span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>
                  If no exact dates are available, we estimate based on validity (usually ~4 years)
                </span>
              </li>
              <li className="flex items-start">
                <span className="text-blue-600 mr-2">•</span>
                <span>
                  We combine all of these active periods to calculate the percentage of time covered
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium mb-2">Coverage Levels</h4>
            <div className="space-y-2">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-[#1D4ED8] rounded mr-3"></div>
                <span className="text-sm">
                  <strong>High (90-100%):</strong> Almost no gaps
                </span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-[#2563EB] rounded mr-3"></div>
                <span className="text-sm">
                  <strong>Good (70-90%):</strong> Some short gaps
                </span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-[#3B82F6] rounded mr-3"></div>
                <span className="text-sm">
                  <strong>Partial (25-70%):</strong> Many missing periods
                </span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-[#93C5FD] rounded mr-3"></div>
                <span className="text-sm">
                  <strong>Low (1-25%):</strong> Very limited coverage
                </span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-[#374151] rounded mr-3"></div>
                <span className="text-sm">
                  <strong>No Coverage (0%):</strong> No known keys in the registry
                </span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">If Exact Dates Aren&apos;t Known</h4>
            <p className="text-gray-600 text-sm">
              We estimate based on the number of certificates in the registry.
            </p>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium mb-2 text-blue-800">Why This Matters</h4>
            <p className="text-blue-700 text-sm">
              Continuous coverage means passports can be verified at any point in the past 10 years
              (the whole lofe of a typical passport.) Gaps mean some passports from certain years
              might not be verifiable.
            </p>
            <p className="text-blue-700 text-sm">
              If you&apos;re having trouble verifying your passport,{" "}
              <span className="font-bold">check when it was issued</span> and compare it with the
              coverage gaps for your country, if it falls inside a gap, verification may not be
              possible.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
