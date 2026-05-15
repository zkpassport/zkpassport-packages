import { useEffect, useRef, type ReactElement } from "react"

import type { QRCardHandle, QRCardOptions } from "../core/types"
import { mount } from "../vanilla/mount"

export type QRCardProps = QRCardOptions

/**
 * React wrapper around the vanilla `mount()`.
 *
 * Callbacks do NOT need `useCallback` — the state machine reads handlers live
 * at fire time and the vanilla `update()` shallow-diff ignores callback fields.
 *
 * @example
 * const request = useZKPassportRequest(sdk, { service, query })
 * <QRCard request={request} onSuccess={(r) => console.log(r)} />
 */
export function QRCard(props: QRCardProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<QRCardHandle | null>(null)
  // Keeps the mount-only effect free of changing dependencies.
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

  // Vanilla `update()` shallow-diffs and no-ops when nothing changed, so
  // running this every render is cheap.
  useEffect(() => {
    handleRef.current?.update(props)
  })

  return <div ref={containerRef} />
}
