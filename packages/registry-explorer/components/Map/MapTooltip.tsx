const MapTooltip = ({
  tooltipContent,
  tooltipPosition,
}: {
  tooltipContent: string
  tooltipPosition: { x: number; y: number }
}) => {
  return (
    <div
      className="fixed z-50 px-3 py-2 text-sm text-white rounded-lg shadow-xl pointer-events-none border border-blue-400/20 backdrop-blur-sm"
      style={{
        backgroundColor: "rgba(30, 64, 175, 0.95)",
        left: tooltipPosition.x + 15,
        top: tooltipPosition.y - 30,
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3), 0 0 20px rgba(59, 130, 246, 0.3)",
      }}
    >
      <div className="whitespace-pre-line">{tooltipContent}</div>
    </div>
  )
}

export default MapTooltip
