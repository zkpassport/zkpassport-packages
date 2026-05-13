// tsup's `loader: { ".css": "text" }` config (in tsup.config.ts) inlines this
// import as a raw string at build time, so no separate CSS file ships next to
// the JS — consumers of the npm package get one auto-injecting bundle.
import css from "./styles.css"

const INJECTED_ATTR = "data-zkpassport-ui"

let injected = false

/**
 * Inject the card's stylesheet into <head> exactly once per document.
 *
 * Guarded by both a module-level flag and a `data-zkpassport-ui` attribute on
 * the resulting <style> tag. The attribute check covers the case where two
 * separate bundles of @zkpassport/ui end up on the same page (e.g. a host app
 * loads it and an embedded widget also loads it); the module flag covers
 * StrictMode double-mount inside a single bundle.
 *
 * Never removed on unmount — multiple cards may share it, and there's no win
 * in tearing it down between renders.
 */
export function injectStyles(): void {
  if (injected) return
  if (typeof document === "undefined") return
  if (document.querySelector(`style[${INJECTED_ATTR}]`)) {
    injected = true
    return
  }
  const style = document.createElement("style")
  style.setAttribute(INJECTED_ATTR, "")
  style.textContent = css
  document.head.appendChild(style)
  injected = true
}
