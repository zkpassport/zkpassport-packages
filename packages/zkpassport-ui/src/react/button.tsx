/** @jsxImportSource react */
import { useEffect, useRef, type ReactElement } from "react"
import { h, render } from "preact"

import { VerifyButton, type VerifyWithZKPassportButtonOptions } from "../verify-button"

export type VerifyWithZKPassportButtonProps = VerifyWithZKPassportButtonOptions

/**
 * A branded button that opens the hosted verification popup on the zkpassport
 * verify origin. Saved IDs live on that origin, so they are reusable across all
 * websites. Falls back to the inline QR card if the popup is blocked.
 *
 * Import from "@zkpassport/ui/react-button" for a button-only bundle (no QR
 * card); "@zkpassport/ui/react" exports the same component alongside the card.
 */
export function VerifyWithZKPassportButton(props: VerifyWithZKPassportButtonProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    return () => {
      render(null, el)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    render(h(VerifyButton, { options: props }), el)
  })

  return <div ref={containerRef} />
}

export type { VerifyWithZKPassportButtonOptions } from "../verify-button"
