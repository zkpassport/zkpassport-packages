import type { ReactNode } from "react"

import { ZKPASSPORT_WORDMARK } from "./screens/zkpassport-logo"

/** One bar in the footer: still ahead, under way, or behind you. */
export type ProgressSegment = "todo" | "active" | "done"

type FlowCardProps = {
  name: string
  logo?: string
  // Left out on the opening and closing screens, where there is nothing to count
  progress?: ProgressSegment[]
  // Changes remount the screen, which replays its entrance animation
  screenKey: string
  children: ReactNode
}

// The "light" theme switches off the card sheet's own dark variant, leaving the
// flow's colours in flow.css as the only ones that apply.
export function FlowCard({ name, logo, progress, screenKey, children }: FlowCardProps) {
  return (
    <div className="zkp-card zkp-flow-card" data-theme="light">
      <div className="zkp-flow-id">
        <span className="zkp-flow-id-app">
          {logo ? <img className="zkp-flow-id-logo" src={logo} alt="" /> : null}
          <span className="zkp-flow-id-name">{name}</span>
        </span>
        <span className="zkp-flow-id-tie" aria-hidden="true" />
        <span
          className="zkp-flow-id-mark"
          dangerouslySetInnerHTML={{ __html: ZKPASSPORT_WORDMARK }}
        />
      </div>
      <div className="zkp-flow-stage">
        <div key={screenKey} className="zkp-flow-step">
          {children}
        </div>
      </div>
      {/* The opening screen has no progress to show, so it puts these here instead */}
      <p className="zkp-flow-privacy">
        <span>Private</span>
        <span>Encrypted</span>
        <span>On your device</span>
      </p>
      {progress ? (
        <ol className="zkp-flow-progress" aria-hidden="true">
          {progress.map((segment, index) => (
            <li key={index} data-state={segment} />
          ))}
        </ol>
      ) : null}
    </div>
  )
}
