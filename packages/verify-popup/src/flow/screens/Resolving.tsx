// Borrows the intro screen's request panel, so the intro fills it in instead of
// replacing the whole screen
export function Resolving() {
  return (
    <div className="zkp-flow-body" role="status" aria-label="Preparing verification">
      <div className="zkp-flow-skeleton">
        <div className="zkp-skel-rows">
          <span className="zkp-skel-row" style={{ width: "68%" }} />
          <span className="zkp-skel-row zkp-skel-row-detail" style={{ width: "48%" }} />
          <span className="zkp-skel-row" style={{ width: "56%" }} />
          <span className="zkp-skel-row zkp-skel-row-detail" style={{ width: "48%" }} />
        </div>
      </div>
    </div>
  )
}
