
export interface TooltipContent {
  title: string
  supportedDocuments: string[]
  coverage: string
  certificateCount: number
}
export interface MapTooltipProps {
  tooltipContent: TooltipContent
  tooltipPosition: { x: number; y: number }
}

const MapTooltip = ({
  tooltipContent,
  tooltipPosition,
}: MapTooltipProps) => {
  // Helper function to get coverage color and status
  const getCoverageStatus = (coverage: string) => {
    const percentageMatch = coverage.match(/(\d+\.?\d*)%/)
    if (!percentageMatch) {
      return { 
        status: "Unknown", 
        className: "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
      }
    }
    
    const percentage = parseFloat(percentageMatch[1])
    if (percentage >= 90) return { 
      status: "High", 
      className: "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200" 
    }
    if (percentage >= 70) return { 
      status: "Good", 
      className: "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200" 
    }
    if (percentage >= 25) return { 
      status: "Partial", 
      className: "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200" 
    }
    if (percentage >= 0) return { 
      status: "Low", 
      className: "bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200" 
    }
    return { 
      status: "No data", 
      className: "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200" 
    }
  }

  const coverageStatus = getCoverageStatus(tooltipContent.coverage)

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: tooltipPosition.x + 15,
        top: tooltipPosition.y - 10,
      }}
    >
      {/* Main tooltip container */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-64 max-w-80">
        {/* Header */}
        <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
            {tooltipContent.title}
          </h3>
        </div>
        
        {/* Content */}
        <div className="px-4 py-3 space-y-2">
          {/* Coverage Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                Coverage:
              </span>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${coverageStatus.className}`}>
                  {coverageStatus.status}
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-700 dark:text-gray-300 text-right">
              {tooltipContent.coverage}
            </div>
          </div>
          
          {/* Certificate Count */}
          {tooltipContent.certificateCount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                Certificates:
              </span>
              <span className="text-xs text-gray-900 dark:text-white font-medium">
                {tooltipContent.certificateCount}
              </span>
            </div>
          )}
          
          {/* Supported Documents */}
          {tooltipContent.supportedDocuments.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
                Supported Documents:
              </div>
              <div className="flex flex-wrap gap-1">
                {tooltipContent.supportedDocuments.map((doc, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200"
                  >
                    {doc}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Click to see more details
          </p>
        </div>
      </div>
      
      {/* Tooltip arrow */}
      <div className="absolute -left-2 top-4">
        <div className="w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-white dark:border-r-gray-800"></div>
      </div>
    </div>
  )
}

export default MapTooltip
