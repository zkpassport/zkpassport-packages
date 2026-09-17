import type { ReactNode } from "react"

import { ICON_TICK } from "./screens/icons"
import { ZKPASSPORT_WORDMARK } from "./screens/zkpassport-logo"

const STAGES = [
  { key: "verify", label: "Verify" },
  { key: "connect", label: "Connect" },
  { key: "mint", label: "Mint" },
] as const

/** Which part of the journey the user is on; "done" completes the last stage. */
export type FlowStage = (typeof STAGES)[number]["key"] | "done" | null

type FlowCardProps = {
  name: string
  logo?: string
  stage: FlowStage
  // Changes remount the step area, which replays its entrance animation
  stepKey: string
  children: ReactNode
}

// One box for the whole flow: who is asking stays at the top and how far along
// you are stays at the foot, while the step between them changes.
// The "light" theme switches off the card sheet's own dark variant, leaving the
// flow's colours in flow.css as the only ones that apply.
export function FlowCard({ name, logo, stage, stepKey, children }: FlowCardProps) {
  return (
    <div className="zkp-card zkp-flow-card" data-theme="light">
      <div className="zkp-flow-id">
        {logo ? <img className="zkp-flow-id-logo" src={logo} alt="" /> : null}
        <span className="zkp-flow-id-name">{name}</span>
        <span
          className="zkp-flow-id-mark"
          dangerouslySetInnerHTML={{ __html: ZKPASSPORT_WORDMARK }}
        />
      </div>
      {/* flow.css keeps this on the opening screen only; every later step says what it wants */}
      <p className="zkp-flow-id-note">
        <strong>ZKPassport</strong> checks your ID. {name} only sees the answer.
      </p>
      <div key={stepKey} className="zkp-flow-step">
        {children}
      </div>
      <Stepper stage={stage} />
    </div>
  )
}

// Every stage stays readable, so what is left to do is never a surprise. The one
// under way is a ring rather than a tick: it has not happened yet.
function Stepper({ stage }: { stage: FlowStage }) {
  if (stage === null) return null
  const current = stage === "done" ? STAGES.length : STAGES.findIndex((item) => item.key === stage)
  return (
    <ol className="zkp-flow-steps">
      {STAGES.map((item, index) => (
        <li
          key={item.key}
          className="zkp-flow-stage"
          data-state={index < current ? "done" : index === current ? "current" : "upcoming"}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="zkp-flow-stage-dot" dangerouslySetInnerHTML={{ __html: ICON_TICK }} />
          <span className="zkp-flow-stage-label">{item.label}</span>
        </li>
      ))}
    </ol>
  )
}
