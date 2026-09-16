export function Resolving() {
  return (
    <div className="zkp-flow-body" role="status" aria-label="Preparing verification">
      <div className="zkp-skel-rows zkp-flow-skeleton">
        <span className="zkp-skel-row" style={{ width: "68%" }} />
        <span className="zkp-skel-row zkp-skel-row-detail" style={{ width: "48%" }} />
        <span className="zkp-skel-row" style={{ width: "56%" }} />
      </div>
    </div>
  )
}
