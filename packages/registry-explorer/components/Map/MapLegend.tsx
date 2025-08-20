import React from "react"
import LegendContainer from "./LegendContainer"
import LegendItem from "./LegendItem"
import { COVERAGE_LEGEND_ITEMS } from "@/lib/mapUtils"

const MapLegend: React.FC = () => {
  return (
    <LegendContainer title="Legend">
      {COVERAGE_LEGEND_ITEMS.map((item, index) => (
        <LegendItem key={index} color={item.color} label={item.label} />
      ))}
    </LegendContainer>
  )
}

export default MapLegend
