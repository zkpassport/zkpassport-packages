/** @jsxImportSource react */
import { useEffect, useRef, type ReactElement } from "react"
import { h, render } from "preact"

import { Card } from "../card"
import type { ZKPassportQRCodeOptions } from "../types"

export type ZKPassportQRCodeProps = ZKPassportQRCodeOptions

export function ZKPassportQRCode(props: ZKPassportQRCodeProps): ReactElement {
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
    render(h(Card, { options: props }), el)
  })

  return <div ref={containerRef} />
}

export * from "../types"
