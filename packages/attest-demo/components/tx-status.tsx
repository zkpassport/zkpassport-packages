"use client"

import { useCallback, useState } from "react"

export type TxState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; hash: `0x${string}`; note?: string }
  | { status: "error"; message: string }

export function useTx() {
  const [state, setState] = useState<TxState>({ status: "idle" })
  const run = useCallback(async (fn: () => Promise<{ hash: `0x${string}`; note?: string }>) => {
    setState({ status: "pending" })
    try {
      const { hash, note } = await fn()
      setState({ status: "success", hash, note })
    } catch (reason) {
      setState({
        status: "error",
        message: reason instanceof Error ? reason.message : String(reason),
      })
    }
  }, [])
  return { state, run }
}

export function TxStatus({ state, explorerBaseUrl }: { state: TxState; explorerBaseUrl?: string }) {
  if (state.status === "idle") return null
  if (state.status === "pending")
    return <p className="text-slate-300">Waiting for the transaction…</p>
  if (state.status === "error") return <p className="break-all text-red-400">{state.message}</p>
  return (
    <p className="text-emerald-400">
      Done{state.note ? ` — ${state.note}` : ""}.{" "}
      {explorerBaseUrl ? (
        <a
          className="underline"
          href={`${explorerBaseUrl}/tx/${state.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction
        </a>
      ) : (
        <span className="break-all text-slate-400">{state.hash}</span>
      )}
    </p>
  )
}
