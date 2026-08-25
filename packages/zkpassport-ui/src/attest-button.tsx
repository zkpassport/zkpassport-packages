import { useCallback, useEffect, useRef, useState } from "preact/hooks"

import { Card } from "./card"
import { buildAttestCardOptions, type AttestVerifyOptions } from "./attest-options"
import type { ZKPassportQRCodeOptions } from "./types"

export type AttestButtonProps = {
  options: AttestVerifyOptions
  label?: string
}

type ButtonState = "idle" | "loading" | "card"

/**
 * Branded entry point for the attest flow: button → (fetch policy, build
 * request) → the existing QR card. On build failure the button returns to
 * idle and the error is forwarded to options.onError.
 */
export function AttestButton({ options, label }: AttestButtonProps) {
  const [state, setState] = useState<ButtonState>("idle")
  const [cardOptions, setCardOptions] = useState<ZKPassportQRCodeOptions | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Same convention as use-card.ts: nothing fires after unmount.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const start = useCallback(() => {
    setState("loading")
    buildAttestCardOptions(optionsRef.current)
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
