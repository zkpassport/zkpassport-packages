export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="zkp-flow-body">
      <p className="zkp-flow-status" role="alert">
        {message}
      </p>
    </div>
  )
}
