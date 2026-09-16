import { Hint, Title } from "./primitives"

type Stage = "scanned" | "proving"

const COPY: Record<Stage, { title: string; caption: string }> = {
  scanned: { title: "Waiting for you", caption: "Approve the request on your phone." },
  proving: { title: "Almost there", caption: "Your phone is creating the proof." },
}

export function Scanning({ progress }: { progress: Stage }) {
  return (
    <div className="zkp-flow-body" data-centered="">
      <div className="zkp-flow-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="zkp-flow-heading">
        <Title>{COPY[progress].title}</Title>
        <Hint>{COPY[progress].caption}</Hint>
      </div>
    </div>
  )
}
