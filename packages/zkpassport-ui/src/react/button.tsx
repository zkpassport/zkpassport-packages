/** @jsxImportSource react */
import { useEffect, useRef, type ReactElement } from "react"
import { h, render } from "preact"

import { VerifyButton, type VerifyWithZKPassportButtonOptions } from "../verify-button"

export type VerifyWithZKPassportButtonProps = VerifyWithZKPassportButtonOptions

/** Branded button that opens the hosted verification popup. */
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
