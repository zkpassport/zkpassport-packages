import { useCallback, useEffect, useRef, useState } from "preact/hooks"

import { Card } from "./card"
import { buildAttestCardOptions, type AttestVerifyOptions } from "./attest-options"
import type { ZKPassportQRCodeOptions } from "./types"

export type AttestButtonProps = {
  options: AttestVerifyOptions
  label?: string
}

type ButtonState = "idle" | "loading" | "card"

const FORWARDED_CALLBACKS = [
  "onReady",
  "onRetryClicked",
  "onBridgeConnect",
  "onRequestReceived",
  "onGeneratingProof",
  "onProofGenerated",
  "onReject",
  "onError",
  "onResult",
] as const

function liveCallbacks(ref: { current: AttestVerifyOptions }): AttestVerifyOptions {
  const live = { ...ref.current }
  for (const key of FORWARDED_CALLBACKS) {
    live[key] = ((...args: unknown[]) =>
      (ref.current[key] as ((...a: unknown[]) => void) | undefined)?.(...args)) as never
  }
  return live
}

/** "Verify with ZKPassport" button for an attest registry policy. */
export function AttestButton({ options, label }: AttestButtonProps) {
  const [state, setState] = useState<ButtonState>("idle")
  const [cardOptions, setCardOptions] = useState<ZKPassportQRCodeOptions | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const start = useCallback(() => {
    setState("loading")
    buildAttestCardOptions(liveCallbacks(optionsRef))
      .then((built) => {
        if (!mountedRef.current) return
        setCardOptions(built)
        setState("card")
      })
      .catch((reason) => {
        if (!mountedRef.current) return
        setState("idle")
        try {
          optionsRef.current.onError?.(reason instanceof Error ? reason.message : String(reason))
        } catch {
          // Swallow consumer errors.
        }
      })
  }, [])

  if (state === "card" && cardOptions) {
    return <Card options={cardOptions} />
  }

  return (
    <button
      type="button"
      className="zkp-attest-button"
      disabled={state === "loading"}
      onClick={start}
    >
      {state === "loading" ? "Loading…" : (label ?? "Verify with ZKPassport")}
    </button>
  )
}
