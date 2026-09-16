import { ICON_CROSS } from "./icons"
import { ErrorDetail, Title } from "./primitives"

export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="zkp-flow-body" data-centered="">
      <div className="zkp-error-icon" dangerouslySetInnerHTML={{ __html: ICON_CROSS }} />
      <Title>Something went wrong</Title>
      <ErrorDetail text={message} />
    </div>
  )
}
