import { ICON_CROSS } from "./icons"
import { Actions, ErrorDetail, Heading, Primary } from "./primitives"

type ErrorScreenProps = {
  message: string
  // Given when the flow can be started again; otherwise the only way on is out
  onRetry?: () => void
}

export function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  return (
    <div className="zkp-flow-body">
      <div className="zkp-flow-done">
        <div className="zkp-flow-seal" data-tone="error">
          <span dangerouslySetInnerHTML={{ __html: ICON_CROSS }} />
        </div>
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
