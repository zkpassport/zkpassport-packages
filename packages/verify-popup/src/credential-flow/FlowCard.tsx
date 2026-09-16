import type { ReactNode } from "react"
import { ICON_ZKP_MARK } from "@zkpassport/ui/hosted"

import { ICON_CHECK } from "./screens/icons"

/** Which part of the journey the user is on, or null once nothing is left to do. */
export type FlowStage = "verify" | "connect" | "mint" | null

const STAGES = [
  { key: "verify", label: "Verify ID" },
  { key: "connect", label: "Connect wallet" },
  { key: "mint", label: "Add to wallet" },
] as const

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
        <div className="zkp-header-icons">
          <div className="zkp-zkp-icon" dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }} />
          {logo ? (
            <>
              <div className="zkp-header-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="zkp-app-icon-slot">
                <img className="zkp-app-icon" src={logo} alt="" />
              </div>
            </>
          ) : null}
        </div>
        <p className="zkp-title">
          <strong>{name}</strong>
          {" uses "}
          <strong>ZKPassport</strong>
          {" to verify identity without compromising your privacy."}
        </p>
      </div>
      <ProgressRail stage={stage} />
      <div className="zkp-divider zkp-divider-header" />
      <div key={stepKey} className="zkp-flow-step">
        {children}
      </div>
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
          <span className="zkp-flow-rail-label">
            {index < current ? (
              <span
                className="zkp-flow-glyph"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: ICON_CHECK }}
              />
            ) : null}
            {item.label}
          </span>
        </li>
      ))}
    </ol>
  )
}
