/**
 * Structural shape of `sdk.request(...).<gates>.done()`. Duck-typed on purpose
 * so the UI package has no runtime dependency on `@zkpassport/sdk` and the two
 * can evolve independently.
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
  /** Suitable for logs; not necessarily user-facing. */
  message: string
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

  /**
   * Header strings. Optional for React consumers using `useZKPassportRequest`
   * — the hook attaches them to the built request (see
   * `core/service-bridge.ts`) and the card reads them as a fallback. Props
   * win over the attached service. Vanilla consumers should pass these.
   */
  appName?: string
  appIcon?: string

  /** Reserved — ignored in v1 (light-only). See top of `core/styles.css`. */
  theme?: "light" | "dark" | "auto"

  /** Fires once when the QR first becomes scannable. */
  onReady?: () => void
  onSuccess?: (response: QRCardSuccessResponse) => void
  onReject?: () => void
  onError?: (err: QRCardError) => void
  /**
   * Fires when the user clicks retry. Hook consumers get auto-retry for free;
   * vanilla consumers should rebuild the request and call
   * `handle.update({ request })` themselves.
   */
  onRetryClicked?: () => void
}

export type QRCardHandle = {
  update(partial: Partial<QRCardOptions>): void
  unmount(): void
}

/** Internal — exported for testing, not part of the public API. */
export type QRCardState =
  | "preparing"
  | "connecting"
  | "waiting"
  | "scanned"
  | "generating"
  | "success"
  | "error"
