import { ICON_SEAL_CROSS } from "../shared/icons"
import { Actions, ErrorDetail, Heading, Primary, Secondary } from "../shared/controls"

type ErrorScreenProps = {
  title?: string
  message: string
  // Given when the flow can be started again; otherwise the only way on is out
  onRetry?: () => void
  retryLabel?: string
  onStartOver?: () => void
}

export function ErrorScreen({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  onStartOver,
}: ErrorScreenProps) {
  return (
    <div className="flow-body">
      <div className="flow-done">
        <div
          className="flow-seal"
          data-tone="error"
          dangerouslySetInnerHTML={{ __html: ICON_SEAL_CROSS }}
        />
        <Heading title={title} />
        <ErrorDetail text={message} />
      </div>
      <Actions>
        {onRetry ? (
          <Primary onClick={onRetry}>{retryLabel}</Primary>
        ) : (
          <Primary onClick={() => window.close()}>Close</Primary>
        )}
        {onStartOver ? <Secondary onClick={onStartOver}>Start over</Secondary> : null}
      </Actions>
    </div>
  )
}
