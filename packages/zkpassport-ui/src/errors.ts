/**
 * Why a verification did not produce a proof.
 *
 * One class with a `kind` rather than several: `instanceof` is unreliable when a package resolves
 * twice through dual ESM/CJS, and a string field always works.
 */
export type ZKPassportErrorKind =
  /** Declined on the app's consent screen. Reported by the phone, so authoritative. */
  | "rejected"
  /** The window was closed before a result. Inferred from polling, so best-effort. */
  | "closed"
  /** The connection to the phone dropped. */
  | "bridge-lost"
  /** The app reported a failure, or the request could not be built. */
  | "failed"
  /** Pop-ups blocked, or an in-app browser that cannot host the verification window. */
  | "blocked"

export class ZKPassportError extends Error {
  readonly kind: ZKPassportErrorKind
  /**
   * True when the user simply did not finish. Lets an integration filter these out of error
   * reporting in one check — "user closed the window" is not actionable — and keeps working when
   * new kinds are added.
   */
  readonly cancelled: boolean

  constructor(kind: ZKPassportErrorKind, message: string) {
    super(message)
    this.name = "ZKPassportError"
    this.kind = kind
    this.cancelled = kind === "rejected" || kind === "closed"
  }
}
