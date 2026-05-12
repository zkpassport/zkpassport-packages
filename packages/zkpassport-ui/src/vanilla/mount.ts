import type { QRCardHandle, QRCardOptions } from "../core/types"

/**
 * Mount the QR verification card into a host element.
 *
 * @example
 * const handle = mount(document.getElementById("zkp")!, {
 *   request: null,
 *   appName: "Your App",
 *   appIcon: "/logo.png",
 *   purpose: "Verify you're over 18",
 *   onSuccess: (r) => console.log(r),
 * })
 * // Later, once the SDK request is built:
 * handle.update({ request })
 */
export function mount(element: HTMLElement, options: QRCardOptions): QRCardHandle {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error(
      "@zkpassport/ui: mount() must be called in a browser environment (document and window required).",
    )
  }
  if (!(element instanceof HTMLElement)) {
    throw new Error("@zkpassport/ui: mount() requires an HTMLElement as the first argument.")
  }

  void options // PR 1 stub. Real implementation lands in PR 2.
  throw new Error("@zkpassport/ui: mount() not implemented in PR 1 scaffolding")
}
