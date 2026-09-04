/** @jsxImportSource react */
import { useEffect, useRef, type ReactElement } from "react"
import { h, render } from "preact"

import { AttestButton } from "../attest-button"
import type { AttestVerifyOptions } from "../attest-options"

export type AttestVerifyButtonProps = AttestVerifyOptions & { label?: string }

export function AttestVerifyButton(props: AttestVerifyButtonProps): ReactElement {
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
    const { label, ...options } = props
    render(h(AttestButton, { options, label }), el)
  })

  return <div ref={containerRef} />
}
