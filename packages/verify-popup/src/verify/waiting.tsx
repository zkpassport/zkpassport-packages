import { useEffect, useState } from "react"
import { isMobileLike } from "@zkpassport/ui/hosted"

import { FootLinks, Heading, Main } from "../shared/controls"
import { ErrorScreen } from "../shared/error"
import { useOpenApp } from "../shared/use-open-app"

/**
 * How far the phone has got, once it has picked the request up. While proving,
 * `done` counts the proofs the bridge has sent back and `total` is how many it
 * says there will be.
 */
export type ScanProgress =
  { stage: "scanned" } | { stage: "proving"; done: number; total: number | null }

export function withProof(
  progress: ScanProgress | null,
  proof: { total?: number },
): ScanProgress | null {
  if (progress?.stage !== "proving") return progress
  return { ...progress, done: progress.done + 1, total: proof.total ?? progress.total }
}

export type PhoneState = "checking" | "connected" | "gone" | null

export function Waiting({
  progress,
  onStartAgain,
  phone = null,
  requestUrl = null,
}: {
  progress: ScanProgress
  onStartAgain: () => void
  phone?: PhoneState
  requestUrl?: string | null
}) {
  const approving = progress.stage === "scanned"
  const slow = useSlowProgress(progress.stage)
  const [mobile] = useState(isMobileLike)
  const { openApp } = useOpenApp(requestUrl, { probe: false })
  const canOpenApp = mobile && requestUrl !== null

  if (phone === "gone") {
    return (
      <ErrorScreen
        title="Lost connection to your phone"
        message="ZKPassport was closed or went offline before you finished. Start again to continue."
        onRetry={onStartAgain}
        retryLabel="Start again"
        links={
          canOpenApp ? (
            <button type="button" className="scan-reveal" onClick={openApp}>
              Open ZKPassport again
            </button>
          ) : null
        }
      />
    )
  }

  return (
    <div className="flow-body">
      <Main>
        <Heading title={approving ? "Approve on your phone" : "Verifying your ID"} />
        <div className="flow-waiting">
          {approving ? <PhoneSwipe /> : <PulsingDots />}
          <div className="flow-waiting-text">
            <p className="flow-hint" role="status">
              {phone === "checking"
                ? "Checking your phone…"
                : approving
                  ? "Slide to verify in ZKPassport"
                  : caption(progress)}
            </p>
            <p className="flow-keep-open">
              {slow ? "Taking longer than usual. Check your phone." : "Keep this window open"}
            </p>
          </div>
        </div>
      </Main>
      <FootLinks>
        <button type="button" className="scan-reveal" onClick={onStartAgain}>
          Start again
        </button>
      </FootLinks>
    </div>
  )
}

// Nothing tells this page whether the phone is still working or gone, so after a while it stops
// promising that waiting will help
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
  if (progress.stage !== "proving") return ""
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
