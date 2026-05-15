// Hidden contract between `useZKPassportRequest` (React) and the `mount()`
// renderer: the hook attaches the service (`name` / `logo`) under this symbol
// to the built request so the card can render its header without the consumer
// having to pass `appName` / `appIcon` as props on `<QRCard>`. Same pattern as
// `retry-bridge.ts` — see comment there for the `Symbol.for` rationale.

export const ZKP_SERVICE = Symbol.for("@zkpassport/ui/service")

// Only the fields the card actually renders today. If a future state ever
// needs more (e.g. surface `purpose` under the title), extend this type AND
// the writer in `react/use-request.ts` AND the reader in `vanilla/mount.ts`
// in the same change — silent drift between the three is the whole risk of
// a hidden-symbol contract.
export type AttachedService = {
  name: string
  logo: string
}

/** Read the attached service, if any. */
export function readService(target: unknown): AttachedService | undefined {
  if (target === null || (typeof target !== "object" && typeof target !== "function")) {
    return undefined
  }
  const value = (target as Record<symbol, unknown>)[ZKP_SERVICE]
  if (value === null || typeof value !== "object") return undefined
  const { name, logo } = value as Partial<AttachedService>
  if (typeof name !== "string" || typeof logo !== "string") return undefined
  return { name, logo }
}
