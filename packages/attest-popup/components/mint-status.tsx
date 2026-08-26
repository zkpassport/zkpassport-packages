export type MintState =
  | { step: "pending"; txHash?: `0x${string}` }
  | { step: "rejected" }
  | { step: "failed"; message: string }

export function MintStatus({
  state,
  explorerBaseUrl,
  onRetry,
}: {
  state: MintState
  explorerBaseUrl?: string
  onRetry: () => void
}) {
  if (state.step === "pending") {
    return (
      <div className="space-y-2">
        <p>Minting your credential…</p>
        {state.txHash &&
          (explorerBaseUrl ? (
            <a
              className="text-sm text-sky-400 underline"
              href={`${explorerBaseUrl}/tx/${state.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          ) : (
            <p className="break-all text-sm text-slate-400">{state.txHash}</p>
          ))}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-red-400">
        {state.step === "rejected"
          ? "The mint transaction was declined. It is required to finish verification."
          : state.message}
      </p>
      <button className="rounded bg-sky-600 px-4 py-2" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
