/**
 * Run a consumer callback while swallowing any thrown error.
 *
 * The card stays UI-only — a handler thrown by the consumer's app must never
 * crash the card or interrupt the SDK event flow. All consumer callbacks
 * (`onReady`, `onSuccess`, `onReject`, `onError`, `onRetryClicked`) and the
 * hidden retry hook are dispatched through this helper.
 */
export function safeCall<A extends unknown[]>(
  fn: ((...args: A) => void) | undefined | null,
  ...args: A
): void {
  if (!fn) return
  try {
    fn(...args)
  } catch {
    // Intentionally swallowed — see function-level comment.
  }
}
