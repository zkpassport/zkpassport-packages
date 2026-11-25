import type { ReactNode } from "react"

import { ICON_SEAL_CROSS } from "../shared/icons"
import { Actions, FootLinks, Primary, Secondary } from "../shared/controls"

type ErrorScreenProps = {
  title?: string
  message: string
  // Technical text worth keeping for a bug report, folded away from the explanation
  detail?: string
  // Given when the flow can be started again; otherwise the only way on is out
  onRetry?: () => void
  retryLabel?: string
  onStartOver?: () => void
  // A tab the user opened themselves can't be closed by the page, so it offers no Close
  closable?: boolean
  links?: ReactNode
}

export function ErrorScreen({
  title = "Something went wrong",
  message,
  detail,
  onRetry,
  retryLabel = "Try again",
  onStartOver,
  closable = true,
  links,
}: ErrorScreenProps) {
  // A page opened from a link has no window to go back to, and the browser will not close it
  const canClose = closable && !!window.opener
  return (
    <div className="flow-body">
      <div className="flow-done" role="alert">
        <div
          className="flow-seal"
          data-tone="error"
          dangerouslySetInnerHTML={{ __html: ICON_SEAL_CROSS }}
        />
        <p className="flow-done-title">{title}</p>
        <p className="flow-done-sub">{message}</p>
        {detail && detail !== message ? (
          <details className="flow-more">
            <summary>Details</summary>
            <p className="flow-detail">{detail}</p>
          </details>
        ) : null}
      </div>
      <Actions>
        {onRetry ? (
          <Primary onClick={onRetry}>{retryLabel}</Primary>
        ) : canClose ? (
          <Primary onClick={() => window.close()}>Close</Primary>
        ) : null}
        {onStartOver ? <Secondary onClick={onStartOver}>Start again</Secondary> : null}
      </Actions>
      {links ? <FootLinks>{links}</FootLinks> : null}
    </div>
  )
}
