// Hidden contract between `useZKPassportRequest` and `mount()`: the hook
// attaches the service under this symbol on the built request so the card can
// render its header without the consumer passing `appName` / `appIcon` props.
// Same pattern as `retry-bridge.ts`.

export const ZKP_SERVICE = Symbol.for("@zkpassport/ui/service")

// Only the fields the card renders today. If you extend this, also update the
// writer in `react/use-request.ts` and the reader in `vanilla/mount.ts` in the
// same change — silent drift between the three is the risk of a hidden contract.
export type AttachedService = {
  name: string
  logo: string
}

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
