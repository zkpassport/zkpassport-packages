// Borrows the intro screen's request panel, so the intro fills it in instead of
// replacing the whole screen
export function Resolving() {
  return (
    <div className="zkp-flow-body" role="status" aria-label="Preparing verification">
      <div className="zkp-flow-skeleton">
        <p className="zkp-eyebrow">
          <span className="zkp-skel-row" />
        </p>
        <div className="zkp-skel-rows">
          <span className="zkp-skel-row" style={{ width: "68%" }} />
          <span className="zkp-skel-row" style={{ width: "56%" }} />
        </div>
      </div>
    </div>
  )
}
