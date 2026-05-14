// Hidden contract between `useZKPassportRequest` (React) and the `mount()`
// renderer: the hook attaches a function under this symbol to the built
// request, and the card invokes it when the user clicks the retry button so
// a fresh QR is generated without any consumer wiring.
//
// `Symbol.for` makes the lookup work across module copies — if a consumer ends
// up with two instances of the package (e.g. mixed ESM/CJS or a workspace
// hiccup), the hook and the card still agree on the key.
export const ZKP_RETRY = Symbol.for("@zkpassport/ui/retry")

/** Read the attached retry function, if any. */
export function readRetry(target: unknown): (() => void) | undefined {
  if (target === null || (typeof target !== "object" && typeof target !== "function")) {
    return undefined
  }
  const fn = (target as Record<symbol, unknown>)[ZKP_RETRY]
  return typeof fn === "function" ? (fn as () => void) : undefined
}
