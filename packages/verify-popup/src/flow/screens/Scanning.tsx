import { useEffect, useState } from "react"

import type { ScanProgress } from "./Scan"
import { Heading, Main } from "./primitives"

// Proving runs for several seconds with nothing to show for it, so the line
// under the title moves on even when the phone has no news.
const PROVING_CAPTIONS = ["Your phone is working on it", "This takes a few seconds", "Almost there"]
const CAPTION_SECONDS = 3.5

export function Scanning({ progress }: { progress: ScanProgress }) {
  const approving = progress === "scanned"
  const provingCaption = useRotatingCaption(PROVING_CAPTIONS)
  const caption = approving ? "Tap Approve in the ZKPassport app" : provingCaption
  return (
    <div className="zkp-flow-body">
      <Main>
        <Heading title={approving ? "Check your phone" : "Checking your ID"} />
        <div className="zkp-flow-waiting">
          {approving ? <PhoneTap /> : <PulsingDots />}
          <p className="zkp-flow-hint" role="status">
            {caption}
          </p>
        </div>
      </Main>
    </div>
  )
}

// A phone with its approve button lit up, and a tap landing on it over and over
function PhoneTap() {
  return (
    <div className="zkp-flow-phone" aria-hidden="true">
      <svg viewBox="0 0 124 176">
        <rect className="zkp-flow-phone-body" x="14" y="4" width="96" height="168" rx="18" />
        <rect className="zkp-flow-phone-notch" x="50" y="15" width="24" height="5" rx="2.5" />
        <rect className="zkp-flow-phone-line" x="32" y="46" width="60" height="7" rx="3.5" />
        <rect className="zkp-flow-phone-line" x="32" y="63" width="42" height="7" rx="3.5" />
        <rect className="zkp-flow-phone-button" x="30" y="116" width="64" height="28" rx="14" />
        <polyline className="zkp-flow-phone-check" points="53 130 59 136 71 124" />
        <rect className="zkp-flow-phone-tap" x="30" y="116" width="64" height="28" rx="14" />
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

// Holds on the last line rather than looping, so a long wait never looks like it
// went back to the start
function useRotatingCaption(captions: readonly string[]): string {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(
      () => setIndex((current) => Math.min(current + 1, captions.length - 1)),
      CAPTION_SECONDS * 1000,
    )
    return () => window.clearInterval(timer)
  }, [captions])

  return captions[index]
}
