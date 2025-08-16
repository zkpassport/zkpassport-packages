interface TimelineDatesProps {
  timelineStart: Date
  timelineEnd: Date
}

const TimelineDates: React.FC<TimelineDatesProps> = ({ timelineStart, timelineEnd }) => (
  <div className="flex justify-between text-xs text-gray-500 mt-1">
    <span>{timelineStart.getFullYear()}</span>
    <span className="text-red-600 font-medium">Now</span>
    <span>{timelineEnd.getFullYear()}</span>
  </div>
)

export default TimelineDates
