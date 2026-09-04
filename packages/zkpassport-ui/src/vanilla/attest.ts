import { h, render } from "preact"

import { AttestButton } from "../attest-button"
import type { AttestVerifyOptions } from "../attest-options"

export type AttestButtonHandle = {
  update(next: AttestVerifyOptions & { label?: string }): void
  unmount(): void
}

export function mountAttestButton(
  element: HTMLElement,
  options: AttestVerifyOptions & { label?: string },
): AttestButtonHandle {
  if (typeof document === "undefined" || typeof window === "undefined") {
    throw new Error("@zkpassport/ui: mountAttestButton() requires a browser environment.")
  }
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      "@zkpassport/ui: mountAttestButton() requires an HTMLElement as the first argument.",
    )
  }

  const container = document.createElement("div")
  element.appendChild(container)

  let current = options
  const draw = () => {
    const { label, ...options } = current
    render(h(AttestButton, { options, label }), container)
  }
  draw()

  return {
    update(next) {
      current = next
      draw()
    },
    unmount() {
      render(null, container)
      if (container.parentNode) container.parentNode.removeChild(container)
    },
  }
}
