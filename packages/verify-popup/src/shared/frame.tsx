import type { CSSProperties, ReactNode } from "react"

import { PoweredBy, useFlowPage } from "./flow-card"
import "../main.css"

export function Frame({ children }: { children: ReactNode }) {
  return <div style={styles.frame}>{children}</div>
}

/**
 * A screen with nothing to verify yet, or nothing left to: shown in the same card as the flow, so
 * the window never flashes a different design before a flow mounts.
 */
export function Notice({
  title,
  children,
  after,
}: {
  title?: string
  children: ReactNode
  after?: ReactNode
}) {
  useFlowPage()
  return (
    <div className="flow-card" data-theme="light">
      <div className="flow-stage">
        <div className="flow-step">
          <div className="flow-notice" role="status">
            {title ? <p className="flow-title">{title}</p> : null}
            <p className="flow-lede">{children}</p>
            {after}
          </div>
        </div>
      </div>
      <PoweredBy />
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  frame: {
    // The popup window is a fixed size, so the page is too: whatever a screen
    // cannot fit scrolls inside the card, never the window
    height: "100%",
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    padding: 8,
    boxSizing: "border-box",
  },
}
