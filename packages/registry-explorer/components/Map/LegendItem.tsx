import React from "react"

interface LegendItemProps {
  color: string
  label: string
  className?: string
}

const LegendItem: React.FC<LegendItemProps> = ({ color, label, className = "" }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} aria-hidden="true" />
      <span className="text-xs text-foreground">{label}</span>
    </div>
  )
}

export default LegendItem
