import { useEffect, useRef, type ReactElement } from "react"

import type { QRCardHandle, QRCardOptions } from "../core/types"
import { mount } from "../vanilla/mount"

export type QRCardProps = QRCardOptions

/**
 * React wrapper around the vanilla `mount()` function.
 *
 * Renders a host `<div>`, mounts the imperative card into it on first effect,
 * and pushes prop changes through `handle.update()` on subsequent renders.
 *
 * Consumers do NOT need to memoize callback props with `useCallback` — the
 * underlying state machine reads handlers via a getter at fire time
 * ([core/state.ts](../core/state.ts)), and the vanilla `update()` shallow-diff
 * ignores callback fields, so a parent re-render that recreates handlers does
 * no work here.
 *
 * The `"use client"` directive is prepended to the React entry bundle
 * post-build by tsup; no per-file directive is needed.
 *
 * @example
 * <QRCard
 *   request={request}
 *   appName="Your App"
 *   appIcon="/logo.png"
 *   purpose="Verify you're over 18"
 *   onSuccess={(r) => console.log(r)}
 * />
 */
export function QRCard(props: QRCardProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<QRCardHandle | null>(null)
  // Captures the props used for the very first `mount()` call so the
  // mount-only effect below stays free of changing dependencies.
  const initialPropsRef = useRef(props)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handle = mount(container, initialPropsRef.current)
    handleRef.current = handle
    return () => {
      handle.unmount()
      handleRef.current = null
    }
  }, [])

  // Push every prop change through to the imperative handle. The vanilla
  // `update()` shallow-diffs and no-ops when nothing actually changed, so
  // running this on every render is cheap.
  useEffect(() => {
    handleRef.current?.update(props)
  })

  return <div ref={containerRef} />
}
