import { useEffect, useState } from "react"

import type { ScanProgress } from "../use-credential-flow"
import { ProofLoader } from "./ProofLoader"

// Proving runs for several seconds with nothing to show for it, so the line
// under the title moves on even when the phone has no news.
const PROVING_CAPTIONS = [
  "Your phone is creating the proof",
  "This takes a few seconds",
  "Still working",
  "Almost there",
]
const CAPTION_SECONDS = 3.5

const SCAN_COPY: Record<ScanProgress, { title: string; captions: string[] }> = {
  scanned: { title: "Check your phone", captions: ["Approve the request in the app"] },
  proving: { title: "Creating your proof", captions: PROVING_CAPTIONS },
}

export function Scanning({ progress }: { progress: ScanProgress }) {
  const { title, captions } = SCAN_COPY[progress]
  const caption = useRotatingCaption(captions)
  return (
    <div className="zkp-flow-body" data-centered="">
      <ProofLoader />
      <div className="zkp-flow-heading">
        <p className="zkp-flow-title">{title}</p>
        <p className="zkp-flow-hint" role="status">
          {caption}
          <Ellipsis />
        </p>
      </div>
    </div>
  )
}

// Holds on the last line rather than looping, so a long wait never looks like it
// went back to the start
function useRotatingCaption(captions: string[]): string {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
    if (captions.length < 2) return
    const timer = window.setInterval(
      () => setIndex((current) => Math.min(current + 1, captions.length - 1)),
      CAPTION_SECONDS * 1000,
    )
    return () => window.clearInterval(timer)
  }, [captions])

  return captions[index] ?? captions[0]
}

function Ellipsis() {
  return (
    <span className="zkp-flow-ellipsis" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
