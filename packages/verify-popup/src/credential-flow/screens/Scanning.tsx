import type { ScanProgress } from "../use-credential-flow"
import { Hint, Title } from "./primitives"

const STAGE_COPY: Record<ScanProgress, { title: string; caption: string }> = {
  scanned: { title: "Waiting for you", caption: "Approve the request on your phone." },
  proving: { title: "Almost there", caption: "Your phone is creating the proof." },
}

export function Scanning({ progress }: { progress: ScanProgress }) {
  return (
    <div className="zkp-flow-body" data-centered="">
      <div className="zkp-flow-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="zkp-flow-heading">
        <Title>{STAGE_COPY[progress].title}</Title>
        <Hint>{STAGE_COPY[progress].caption}</Hint>
      </div>
    </div>
  )
}
