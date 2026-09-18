import type { ReactNode } from "react"

import { ZKPASSPORT_WORDMARK } from "./screens/zkpassport-logo"

/** A bar segment: still ahead, being worked on right now, or behind you. */
export type StepState = "todo" | "active" | "done"

type FlowCardProps = {
  name: string
  logo?: string
  // Left out on the opening and closing screens, where there is nothing to count
  steps?: StepState[]
  // Changes remount the step area, which replays its entrance animation
  stepKey: string
  children: ReactNode
}

// Who is asking and how far along you are frame the card from outside; the step
// itself sits on a lighter stage between them, so the eye lands there first.
// The "light" theme switches off the card sheet's own dark variant, leaving the
// flow's colours in flow.css as the only ones that apply.
export function FlowCard({ name, logo, steps, stepKey, children }: FlowCardProps) {
  return (
    <div className="zkp-card zkp-flow-card" data-theme="light">
      <div className="zkp-flow-id">
        <span className="zkp-flow-id-app">
          {logo ? <img className="zkp-flow-id-logo" src={logo} alt="" /> : null}
          <span className="zkp-flow-id-name">{name}</span>
        </span>
        <span className="zkp-flow-id-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span
          className="zkp-flow-id-mark"
          dangerouslySetInnerHTML={{ __html: ZKPASSPORT_WORDMARK }}
        />
      </div>
      <div className="zkp-flow-stage">
        <div key={stepKey} className="zkp-flow-step">
          {children}
        </div>
      </div>
      {/* The opening screen has no progress to show, so it puts these here instead */}
      <p className="zkp-flow-privacy">
        <span>Private</span>
        <span>Encrypted</span>
        <span>On your device</span>
      </p>
      {steps ? (
        <ol className="zkp-flow-progress" aria-hidden="true">
          {steps.map((state, index) => (
            <li key={index} data-state={state} />
          ))}
        </ol>
      ) : null}
    </div>
  )
}
