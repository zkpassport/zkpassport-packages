import { useLayoutEffect, type ReactNode } from "react"

import { ZKPASSPORT_WORDMARK } from "../shared/icons"
import "../main.css"

export type ProgressSegment = "todo" | "active" | "done"

type FlowCardProps = {
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
export function useFlowPage() {
  useLayoutEffect(() => {
    document.body.classList.add("flow-page")
    return () => document.body.classList.remove("flow-page")
  }, [])
}

export function FlowCard({ progress, screenKey, children }: FlowCardProps) {
  useFlowPage()
  return (
    <div className="flow-card" data-theme="light">
      <div className="flow-stage">
        <div key={screenKey} className="flow-step">
          {children}
        </div>
      </div>
      {progress ? (
        <ol className="flow-progress" aria-hidden="true">
          {progress.map((segment, index) => (
            <li key={index} data-state={segment} />
          ))}
        </ol>
      ) : null}
      <PoweredBy />
    </div>
  )
}

export function PoweredBy() {
  return (
    <p className="flow-powered">
      Powered by
      <span
        className="flow-powered-mark"
        role="img"
        aria-label="ZKPassport"
        dangerouslySetInnerHTML={{ __html: ZKPASSPORT_WORDMARK }}
      />
    </p>
  )
}
