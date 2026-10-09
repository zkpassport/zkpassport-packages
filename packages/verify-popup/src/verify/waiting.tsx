import { useEffect, useState } from "react"

import { Heading, Main } from "../shared/controls"

/**
 * How far the phone has got, once it has picked the request up. While proving,
 * `done` counts the proofs the bridge has sent back and `total` is how many it
 * says there will be.
 */
export type ScanProgress =
  | { stage: "scanned" }
  | { stage: "proving"; done: number; total: number | null }

export function withProof(
  progress: ScanProgress | null,
  proof: { total?: number },
): ScanProgress | null {
  if (progress?.stage !== "proving") return progress
  return { ...progress, done: progress.done + 1, total: proof.total ?? progress.total }
}

export function Waiting({ progress }: { progress: ScanProgress }) {
  const approving = progress.stage === "scanned"
  const slow = useSlowProgress(progress.stage)
  return (
    <div className="flow-body">
      <Main>
        <Heading title={approving ? "Check your phone" : "Verifying your ID"} />
        <div className="flow-waiting">
          {approving ? <PhoneSwipe /> : <PulsingDots />}
          <div className="flow-waiting-text">
            <p className="flow-hint" role="status">
              {caption(progress)}
            </p>
            <p className="flow-keep-open">
              {slow
                ? "Taking longer than usual. Check your phone, or close this window and start again."
                : "Keep this window open"}
            </p>
          </div>
        </div>
      </Main>
    </div>
  )
}

// Nothing tells this page whether the phone is still working or gone, so after a while it stops
// promising that waiting will help and offers both answers
const SLOW_AFTER_MS = 3 * 60 * 1000

function useSlowProgress(stage: ScanProgress["stage"]): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [stage])
  return slow
}

// Proving runs for several seconds, so the line follows the proofs the bridge
// sends back rather than a timer
function caption(progress: ScanProgress): string {
  if (progress.stage === "scanned") return "Approve in the ZKPassport app"
  const { done, total } = progress
  if (total === null) return "Your phone is working on it..."
  if (done < total) return `Checking your details · ${done} of ${total}`
  return "Finishing up..."
}

// The app confirms with a slide, not a tap, so the knob runs the track over and
// over rather than a button being pressed
function PhoneSwipe() {
  return (
    <div className="flow-phone" aria-hidden="true">
      <svg viewBox="0 0 124 176">
        <rect className="flow-phone-body" x="14" y="4" width="96" height="168" rx="18" />
        <rect className="flow-phone-notch" x="50" y="15" width="24" height="5" rx="2.5" />
        <rect className="flow-phone-line" x="32" y="46" width="60" height="7" rx="3.5" />
        <rect className="flow-phone-line" x="32" y="63" width="42" height="7" rx="3.5" />
        <rect className="flow-phone-track" x="30" y="116" width="64" height="28" rx="14" />
        <polyline className="flow-phone-chevron" points="70 125 76 130 70 135" />
        <polyline className="flow-phone-chevron" points="79 125 85 130 79 135" />
        <circle className="flow-phone-knob" cx="44" cy="130" r="11" />
      </svg>
    </div>
  )
}

function PulsingDots() {
  return (
    <div className="flow-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  )
}
