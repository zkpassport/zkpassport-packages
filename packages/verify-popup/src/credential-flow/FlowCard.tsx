import type { ReactNode } from "react"

import { ZKPASSPORT_WORDMARK } from "./screens/zkpassport-logo"

const STAGES = [
  { key: "verify", label: "Verify" },
  { key: "connect", label: "Connect" },
  { key: "mint", label: "Mint" },
] as const

/** Which part of the journey the user is on, or null once nothing is left to do. */
export type FlowStage = (typeof STAGES)[number]["key"] | null

type FlowCardProps = {
  name: string
  logo?: string
  stage: FlowStage
  // Changes remount the step area, which replays its entrance animation
  stepKey: string
  children: ReactNode
}

// One box for the whole flow: the header stays put while the step below it changes.
// The "light" theme switches off the card sheet's own dark variant, leaving the
// flow's colours in flow.css as the only ones that apply.
export function FlowCard({ name, logo, stage, stepKey, children }: FlowCardProps) {
  return (
    <div className="zkp-card zkp-flow-card" data-theme="light">
      <div className="zkp-header">
        {logo ? (
          <div className="zkp-app-icon-slot">
            <img className="zkp-app-icon" src={logo} alt="" />
          </div>
        ) : null}
        <p className="zkp-title">
          <strong>{name}</strong>
          {" uses "}
          <strong>ZKPassport</strong>
          {" to verify identity without compromising your privacy."}
        </p>
      </div>
      <ProgressRail stage={stage} />
      <div key={stepKey} className="zkp-flow-step">
        {children}
      </div>
      <div className="zkp-flow-footer" dangerouslySetInnerHTML={{ __html: ZKPASSPORT_WORDMARK }} />
    </div>
  )
}

// Shown only while something is still left to do, so verifying never reads as finished
function ProgressRail({ stage }: { stage: FlowStage }) {
  if (!stage) return null
  const current = STAGES.findIndex((item) => item.key === stage)
  return (
    <ol className="zkp-flow-rail">
      {STAGES.map((item, index) => (
        <li
          key={item.key}
          className="zkp-flow-rail-stage"
          data-state={index < current ? "done" : index === current ? "current" : "upcoming"}
          aria-current={index === current ? "step" : undefined}
        >
          <span className="zkp-flow-rail-bar" />
          <span className="zkp-flow-rail-label">{item.label}</span>
        </li>
      ))}
    </ol>
  )
}
