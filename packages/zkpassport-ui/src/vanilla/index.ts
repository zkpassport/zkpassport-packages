import { h, render } from "preact"

import { Card, type CardControl } from "../card"
import type { QRCardHandle, ZKPassportQRCodeOptions } from "../types"

export function mount(element: HTMLElement, options: ZKPassportQRCodeOptions): QRCardHandle {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("@zkpassport/ui: mount() requires a browser environment.")
  }
  if (!(element instanceof HTMLElement)) {
    throw new Error("@zkpassport/ui: mount() requires an HTMLElement as the first argument.")
  }

  const container = document.createElement("div")
  element.appendChild(container)

  const controlRef: { current: CardControl | null } = { current: null }
  let current = options

  render(h(Card, { options: current, controlRef }), container)

  return {
    update(next) {
      current = next
      render(h(Card, { options: current, controlRef }), container)
    },
    retry() {
      controlRef.current?.retry()
    },
    unmount() {
      render(null, container)
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }
}

export * from "../types"
