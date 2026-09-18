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

// One box for the whole flow: who is asking stays at the top and how far along
// you are stays at the foot, while the step between them changes.
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
      {/* flow.css keeps this on the opening screen only; every later step says what it wants */}
      <p className="zkp-flow-id-note">
        <strong>{name}</strong> wants to check your identity privately with{" "}
        <strong>ZKPassport</strong>.
      </p>
      <div key={stepKey} className="zkp-flow-step">
        {children}
      </div>
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
