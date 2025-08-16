interface ReferenceLineProps {
  date: Date
  timelineStart: Date
  timelineEnd: Date
  color: string
  label: string
  labelColor: string
  title: string
  zIndex?: number
}

const ReferenceLine: React.FC<ReferenceLineProps> = ({
  date,
  timelineStart,
  timelineEnd,
  color,
  label,
  labelColor,
  title,
  zIndex = 10,
}) => {
  const totalDays = (timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24)
  const offset =
    ((date.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100

  return (
    <div
      className={`absolute top-2 bottom-0 w-0.5 ${color}`}
      style={{ left: `${offset}%`, zIndex }}
      title={title}
    >
      <span
        className={`absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs ${labelColor} whitespace-nowrap`}
      >
        {label}
      </span>
    </div>
  )
}

export default ReferenceLine
