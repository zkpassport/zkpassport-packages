import type { ScanProgress } from "./Scan"
import { Heading, Main } from "./primitives"

export function Scanning({ progress }: { progress: ScanProgress }) {
  const approving = progress.stage === "scanned"
  return (
    <div className="zkp-flow-body">
      <Main>
        <Heading title={approving ? "Check your phone" : "Generating proof"} />
        <div className="zkp-flow-waiting">
          {approving ? <PhoneSwipe /> : <PulsingDots />}
          <div className="zkp-flow-waiting-text">
            <p className="zkp-flow-hint" role="status">
              {caption(progress)}
            </p>
            <p className="zkp-flow-keep-open">Keep this window open</p>
          </div>
        </div>
      </Main>
    </div>
  )
}

// Proving runs for several seconds, so the line follows the proofs the bridge
// sends back rather than a timer
function caption(progress: ScanProgress): string {
  if (progress.stage === "scanned") return "Approve in the ZKPassport app"
  const { done, total } = progress
  if (total === null || done === 0) return "Your phone is working on it..."
  if (done < total) return `Checking your details · ${done} of ${total}`
  return "Finishing up..."
}

// The app confirms with a slide, not a tap, so the knob runs the track over and
// over rather than a button being pressed
function PhoneSwipe() {
  return (
    <div className="zkp-flow-phone" aria-hidden="true">
      <svg viewBox="0 0 124 176">
        <rect className="zkp-flow-phone-body" x="14" y="4" width="96" height="168" rx="18" />
        <rect className="zkp-flow-phone-notch" x="50" y="15" width="24" height="5" rx="2.5" />
        <rect className="zkp-flow-phone-line" x="32" y="46" width="60" height="7" rx="3.5" />
        <rect className="zkp-flow-phone-line" x="32" y="63" width="42" height="7" rx="3.5" />
        <rect className="zkp-flow-phone-track" x="30" y="116" width="64" height="28" rx="14" />
        <polyline className="zkp-flow-phone-chevron" points="70 125 76 130 70 135" />
        <polyline className="zkp-flow-phone-chevron" points="79 125 85 130 79 135" />
        <circle className="zkp-flow-phone-knob" cx="44" cy="130" r="11" />
      </svg>
    </div>
  )
}

/** Three dots keeping time while the phone builds the proof. */
function PulsingDots() {
  return (
    <div className="zkp-flow-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  )
}
