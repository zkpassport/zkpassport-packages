/** An element, or a selector for one. */
export type RenderTarget = HTMLElement | string

export function resolveTarget(target: RenderTarget): HTMLElement {
  if (typeof target !== "string") return target
  const element = document.querySelector(target)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`@zkpassport/ui: no element matches "${target}".`)
  }
  return element
}
