import React from "react"

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
  const positionClasses = {
    "bottom-left": "bottom-[10vh] left-[1vw]",
    "bottom-right": "bottom-[10vh] right-[1vw]",
    "top-left": "top-[10vh] left-[1vw]",
    "top-right": "top-[10vh] right-[1vw]",
  }

  return (
    <div
      className={`absolute ${positionClasses[position]} bg-white/95 backdrop-blur-sm rounded-lg shadow-xl p-4 ${className}`}
    >
      <h4 className="text-sm font-semibold text-gray-800 mb-3">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

export default LegendContainer
