/**
 * Structural type of the object returned by `sdk.request(...).<gates>.done()`.
 *
 * We deliberately do NOT import this from `@zkpassport/sdk` so the UI package
 * has no runtime dependency on the SDK — versions can evolve independently and
 * the IIFE bundle stays slim. The shape is duck-typed; any object matching it
 * works.
 */
export type ZKPassportRequestLike = {
  url: string
  onBridgeConnect: (cb: () => void) => void
  onRequestReceived: (cb: () => void) => void
  onGeneratingProof: (cb: () => void) => void
  onResult: (
    cb: (response: { uniqueIdentifier?: string; verified: boolean; result: unknown }) => void,
  ) => void
  onReject: (cb: () => void) => void
  onError: (cb: (error: string) => void) => void
  isBridgeConnected: () => boolean
  requestReceived: () => boolean
}

export type QRCardError = {
  /** Stable identifier for branching. See the error code taxonomy in the design doc. */
  code: "user_rejected" | "proof_failed" | "bridge_error" | "unknown"
  /** Human-readable message — suitable for logs; not necessarily for end users. */
  message: string
  /** Underlying error from the SDK, if any. */
  cause?: unknown
}

export type QRCardSuccessResponse = {
  uniqueIdentifier?: string
  verified: boolean
  result: unknown
}

export type QRCardOptions = {
  /** Result of `sdk.request({...}).<gates>.done()`. May be `null` while preparing. */
  request: ZKPassportRequestLike | null

  /** Required — drives the card header from the first paint. */
  appName: string
  appIcon: string
  purpose: string

  /**
   * Reserved for forward compatibility. Accepted by the type but ignored
   * by the renderer in v1 — the card is light-only. Dark mode will be
   * re-enabled in a future minor without a breaking change. See the
   * comment at the top of `src/core/styles.css` for the re-attachment plan.
   */
  theme?: "light" | "dark" | "auto"

  /** Fires once when the card first becomes scannable (bridge connected, QR visible). */
  onReady?: () => void
  onSuccess?: (response: QRCardSuccessResponse) => void
  onReject?: () => void
  onError?: (err: QRCardError) => void
  /**
   * Fires when the user clicks the retry button in the error state.
   *
   * React consumers using `useZKPassportRequest` get auto-retry for free —
   * the hook rebuilds the request and a new QR appears with no extra wiring.
   * Other consumers should rebuild the request and call
   * `handle.update({ request })` themselves.
   */
  onRetryClicked?: () => void
}

export type QRCardHandle = {
  update(partial: Partial<QRCardOptions>): void
  unmount(): void
}

/** Internal UI state — exported for testing, not part of the public API surface. */
export type QRCardState =
  | "preparing"
  | "connecting"
  | "waiting"
  | "scanned"
  | "generating"
  | "success"
  | "error"
