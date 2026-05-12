import type { QRCardOptions } from "../core/types"

export type QRCardProps = QRCardOptions

/**
 * React wrapper around the vanilla `mount()` function.
 *
 * Use this in any React app (Next.js, Vite, CRA). For Next.js App Router,
 * the package already includes the `"use client"` directive — no extra setup.
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
export function QRCard(props: QRCardProps): React.JSX.Element | null {
  // PR 1 stub. Real implementation lands in PR 3.
  // The component will use `useRef` + `useEffect` to call `mount()` from the vanilla entry,
  // diff `options` shallowly on each render, and call `handle.update()` for changed fields.
  void props
  throw new Error("@zkpassport/ui: <QRCard /> not implemented in PR 1 scaffolding")
}
