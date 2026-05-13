// PR 1 stub. Real idempotent <style> injection lands in PR 2.
//
// PR 2 plan: import the raw CSS text via tsup's `loader: { ".css": "text" }`,
// guard with a module-level flag AND a `data-zkpassport-ui` attribute on the
// injected <style> tag so multiple bundles in the same page don't double-inject.

const INJECTED_ATTR = "data-zkpassport-ui"

let injected = false

export function injectStyles(): void {
  if (injected) return
  if (typeof document === "undefined") return
  if (document.querySelector(`style[${INJECTED_ATTR}]`)) {
    injected = true
    return
  }
  // No-op in PR 1; PR 2 wires the CSS string in. Deliberately do NOT set
  // `injected = true` here — that way a PR 2 mistake (removing the no-op
  // without inserting the real injection) keeps the flag false and shows up
  // as repeated calls instead of silently latching to "done forever".
}
