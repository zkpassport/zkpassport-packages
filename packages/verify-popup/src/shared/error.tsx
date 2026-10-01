import { ICON_SEAL_CROSS } from "../shared/icons"
import { Actions, ErrorDetail, Heading, Primary } from "../shared/controls"

type ErrorScreenProps = {
  message: string
  // Given when the flow can be started again; otherwise the only way on is out
  onRetry?: () => void
}

export function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  return (
    <div className="flow-body">
      <div className="flow-done">
        <div
          className="flow-seal"
          data-tone="error"
          dangerouslySetInnerHTML={{ __html: ICON_SEAL_CROSS }}
        />
        <Heading title="Something went wrong" />
        <ErrorDetail text={message} />
      </div>
      <Actions>
        {onRetry ? (
          <Primary onClick={onRetry}>Try again</Primary>
        ) : (
          <Primary onClick={() => window.close()}>Close</Primary>
        )}
      </Actions>
    </div>
  )
}
