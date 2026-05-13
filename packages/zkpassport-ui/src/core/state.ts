import type {
  QRCardError,
  QRCardOptions,
  QRCardState,
  QRCardSuccessResponse,
  ZKPassportRequestLike,
} from "./types"

type StateMachineConfig = {
  /**
   * Read the latest consumer callbacks at fire time. The renderer holds the
   * live options object; passing a getter (rather than a frozen snapshot)
   * means the machine always sees the current handlers without an explicit
   * sync step, and React parents that recreate handlers each render don't
   * need to thread changes through `update()`.
   */
  getCallbacks: () => Pick<QRCardOptions, "onReady" | "onSuccess" | "onReject" | "onError">
  /** Called every time the UI state changes. The renderer turns this into DOM updates. */
  onTransition: (next: QRCardState) => void
}

export type StateMachine = {
  /** Wire up a request: subscribe to its events and reconcile against its synchronous state. */
  attachRequest: (request: ZKPassportRequestLike) => void
  /** Drop subscriptions for the current request, reset to `preparing`. */
  detachRequest: () => void
  /** Drive the card into the error state from the renderer (e.g. on QR generation failure). */
  fail: (code: QRCardError["code"], message: string, cause?: unknown) => void
  /** Final teardown: equivalent to `detachRequest()` plus a permanent disable. */
  dispose: () => void
}

/**
 * Build a state machine that translates SDK events into card UI states.
 *
 * The machine owns:
 *   - the current `QRCardState` (closed over)
 *   - the subscription generation token (so late-firing async events from a
 *     superseded request are ignored — important for `handle.update({ request })`
 *     called rapidly, e.g. on retry)
 *   - whether `onReady` has fired (fires once per attached request)
 *
 * The renderer owns the DOM. The machine never touches it directly; it only
 * calls `onTransition(next)` and the renderer reacts.
 */
export function createStateMachine(config: StateMachineConfig): StateMachine {
  let state: QRCardState = "preparing"
  let request: ZKPassportRequestLike | null = null
  /**
   * Incremented on every attach/detach/dispose. Subscriber closures capture
   * the value at registration time and bail if it no longer matches —
   * SDK events that fire after a fresh request has replaced an old one would
   * otherwise drive the UI from the wrong source.
   */
  let generation = 0
  let readyFired = false
  let disposed = false

  function transition(next: QRCardState) {
    if (state === next) return
    state = next
    config.onTransition(next)
  }

  function fireReadyOnce() {
    if (readyFired) return
    readyFired = true
    try {
      config.getCallbacks().onReady?.()
    } catch {
      // Consumer-thrown errors in onReady shouldn't crash the card.
    }
  }

  function toError(code: QRCardError["code"], message: string, cause?: unknown) {
    transition("error")
    try {
      config.getCallbacks().onError?.({ code, message, cause })
    } catch {
      // Same reasoning as fireReadyOnce: consumer errors are not our problem.
    }
  }

  function attachRequest(next: ZKPassportRequestLike) {
    if (disposed) return

    // Bump generation to invalidate any subscriber closures from a previous
    // attach. We intentionally skip detachRequest()'s reset-to-`preparing` —
    // the reconciliation block below sets the correct state in one paint,
    // avoiding a skeleton flash on retry / request swap.
    generation += 1
    const myGeneration = generation
    request = next
    readyFired = false

    const guarded = <T extends unknown[]>(fn: (...args: T) => void) => {
      return (...args: T) => {
        if (myGeneration !== generation || disposed) return
        try {
          fn(...args)
        } catch (cause) {
          toError("unknown", "Unexpected error while handling SDK event", cause)
        }
      }
    }

    next.onBridgeConnect(
      guarded(() => {
        if (state === "connecting" || state === "preparing") {
          transition("waiting")
          fireReadyOnce()
        }
      }),
    )
    next.onRequestReceived(
      guarded(() => {
        transition("scanned")
      }),
    )
    next.onGeneratingProof(
      guarded(() => {
        transition("generating")
      }),
    )
    next.onResult(
      guarded((response: QRCardSuccessResponse) => {
        if (response.verified) {
          transition("success")
          try {
            config.getCallbacks().onSuccess?.(response)
          } catch {
            // Same reasoning as fireReadyOnce.
          }
        } else {
          toError("proof_failed", "Proof verification failed")
        }
      }),
    )
    next.onReject(
      guarded(() => {
        transition("error")
        try {
          config.getCallbacks().onReject?.()
        } catch {
          // Same reasoning as fireReadyOnce.
        }
      }),
    )
    next.onError(
      guarded((errorMessage: string) => {
        toError("bridge_error", errorMessage)
      }),
    )

    // Late-mount reconciliation: if the bridge already connected or the request
    // already landed on the phone before we subscribed, drive the state forward
    // synchronously so the user never sees a stuck "connecting…".
    try {
      if (next.requestReceived()) {
        transition("scanned")
      } else if (next.isBridgeConnected()) {
        transition("waiting")
        fireReadyOnce()
      } else {
        transition("connecting")
      }
    } catch (cause) {
      toError("unknown", "Failed to read request bridge state", cause)
    }
  }

  function detachRequest() {
    if (request === null) return
    // Bumping the generation invalidates any in-flight subscriber closures
    // without needing the SDK to expose an `off*` API (which the duck-typed
    // contract in core/types.ts intentionally doesn't require).
    generation += 1
    request = null
    readyFired = false
    transition("preparing")
  }

  return {
    attachRequest,
    detachRequest,
    fail: (code, message, cause) => {
      if (disposed) return
      toError(code, message, cause)
    },
    dispose: () => {
      detachRequest()
      disposed = true
    },
  }
}
