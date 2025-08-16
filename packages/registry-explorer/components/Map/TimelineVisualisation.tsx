import React from "react"
import ReferenceLine from "../ui/referenceLine"

interface TimelineVisualizationProps {
  periods: Array<{
    start: number // Unix timestamp in seconds
    end: number // Unix timestamp in seconds
    isActive: boolean
    label: string
    isEstimated?: boolean
  }>
  timelineStart: Date
  timelineEnd: Date
  color: {
    active: string
    inactive: string
    activeEstimated?: string
    inactiveEstimated?: string
  }
  showReferenceLines?: boolean
}

const TimelineVisualization: React.FC<TimelineVisualizationProps> = ({
  periods,
  timelineStart,
  timelineEnd,
  color,
  showReferenceLines = true,
}) => {
  const now = new Date()
  const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000)
  const totalDays = (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)

  return (
    <>
      {showReferenceLines && (
        <>
          <ReferenceLine
            date={tenYearsAgo}
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
            color="bg-purple-400 opacity-50"
            label="10y ago"
            labelColor="text-purple-600"
            title="10 years ago - typical passport validity"
          />
          <ReferenceLine
            date={now}
            timelineStart={timelineStart}
            timelineEnd={timelineEnd}
            color="bg-red-500"
            label="Today"
            labelColor="text-red-600 font-medium"
            title={`Today: ${now.toLocaleDateString()}`}
            zIndex={20}
          />
        </>
      )}

      {/* Period Bars */}
      {periods.map((period, index) => {
        const startOffset =
          ((period.start * 1000 - timelineStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays) *
          100
        const width =
          ((period.end * 1000 - period.start * 1000) / (1000 * 60 * 60 * 24) / totalDays) * 100

        const getColor = () => {
          if (period.isEstimated) {
            return period.isActive
              ? color.activeEstimated || "bg-purple-400"
              : color.inactiveEstimated || "bg-purple-300"
          }
          return period.isActive ? color.active : color.inactive
        }

        const periodBar = (
          <div
            className={`absolute h-3 rounded-sm transition-all hover:z-10 hover:shadow-md ${getColor()}`}
            style={{
              left: `${startOffset}%`,
              width: `${width}%`,
              top: `${index * 12 + 2}px`,
              opacity: period.isActive ? (period.isEstimated ? 0.8 : 1) : 0.6,
              ...(period.isEstimated && {
                borderStyle: "dashed",
                borderWidth: "1px",
                borderColor: period.isActive ? "#9333ea" : "#d8b4fe",
              }),
            }}
            title={!period.isEstimated ? period.label : undefined}
          />
        )
        return <React.Fragment key={index}>{periodBar}</React.Fragment>
      })}
    </>
  )
}

export default TimelineVisualization
