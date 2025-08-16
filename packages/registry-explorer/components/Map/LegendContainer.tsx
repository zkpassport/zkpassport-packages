import React, { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

interface LegendContainerProps {
  title: string
  children: React.ReactNode
  className?: string
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right"
}

const LegendContainer: React.FC<LegendContainerProps> = ({
  title,
  children,
  className = "",
  position = "bottom-left",
}) => {
  const [isMinimized, setIsMinimized] = useState(false)

  const positionClasses = {
    "bottom-left": "bottom-4 md:bottom-[10vh] left-4 md:left-[1vw]",
    "bottom-right": "bottom-4 md:bottom-[10vh] right-4 md:right-[1vw]",
    "top-left": "top-20 md:top-[10vh] left-4 md:left-[1vw]",
    "top-right": "top-20 md:top-[10vh] right-4 md:right-[1vw]",
  }

  return (
    <div
      className={`absolute ${positionClasses[position]} bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl ${isMinimized ? "p-2" : "p-4"} transition-all duration-300 ${className}`}
    >
      <div className="flex items-center justify-between">
        <h4 className={`text-sm font-semibold text-foreground ${isMinimized ? "" : "mb-3"}`}>
          {title}
        </h4>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="ml-2 text-muted-foreground hover:text-foreground transition-colors md:hidden"
          aria-label={isMinimized ? "Expand legend" : "Collapse legend"}
        >
          {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {!isMinimized && <div className="space-y-2 mt-3">{children}</div>}
    </div>
  )
}

export default LegendContainer
