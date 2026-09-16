// Wears the intro screen's request panel, so reaching the intro fills the panel
// in rather than swapping one screen for another
export function Resolving() {
  return (
    <div className="zkp-flow-body" role="status" aria-label="Preparing verification">
      <div className="zkp-intro-request zkp-flow-skeleton">
        <p className="zkp-eyebrow">
          <span className="zkp-skel-row zkp-flow-skeleton-eyebrow" />
        </p>
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
