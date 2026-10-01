import { useLayoutEffect, type ReactNode } from "react"

import { ZKPASSPORT_WORDMARK } from "../shared/icons"
import "../main.css"

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

/**
 * The dark backdrop is only set while a flow is mounted, so the popup's other
 * screens keep the default background.
 */
function useFlowPage() {
  useLayoutEffect(() => {
    document.body.classList.add("flow-page")
    return () => document.body.classList.remove("flow-page")
  }, [])
}

export function FlowCard({ name, logo, progress, screenKey, children }: FlowCardProps) {
  useFlowPage()
  return (
    <div className="flow-card" data-theme="light">
      <div className="flow-id">
        <span className="flow-id-app">
          {logo ? <img className="flow-id-logo" src={logo} alt="" /> : null}
          <span className="flow-id-name">{name}</span>
        </span>
        <span className="flow-id-tie" aria-hidden="true">
          -
        </span>
        <span className="flow-id-mark" dangerouslySetInnerHTML={{ __html: ZKPASSPORT_WORDMARK }} />
      </div>
      <div className="flow-stage">
        <div key={screenKey} className="flow-step">
          {children}
        </div>
      </div>
      {/* The opening screen has no progress to show, so it puts these here instead */}
      <p className="flow-privacy">
        <span>Private</span>
        <span>Encrypted</span>
        <span>On your device</span>
      </p>
      {progress ? (
        <ol className="flow-progress" aria-hidden="true">
          {progress.map((segment, index) => (
            <li key={index} data-state={segment} />
          ))}
        </ol>
      ) : null}
    </div>
  )
}
