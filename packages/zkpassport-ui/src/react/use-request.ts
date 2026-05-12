import type { ZKPassportRequestLike } from "../core/types"

// Duck-typed so we don't take a hard dep on @zkpassport/sdk at runtime.
// The shape matches the SDK's `QueryBuilder` and `ZKPassport.request()`.
type QueryBuilderLike = {
  done: () => ZKPassportRequestLike
  // Builders chain — the consumer's `query` callback should return the same
  // builder (or a chained one). We accept `unknown` from their callback to
  // avoid over-constraining their gate chain.
}

type ZKPassportLike = {
  request: (service: {
    name: string
    logo: string
    purpose: string
    scope?: string
  }) => Promise<QueryBuilderLike>
}

export type UseZKPassportRequestOptions = {
  /** Passed straight to `sdk.request({...})`. */
  service: { name: string; logo: string; purpose: string; scope?: string }
  /** Apply gates to the builder. Return the chained builder. */
  query: (builder: QueryBuilderLike) => QueryBuilderLike
  /** Re-runs the request build when any value changes. Default: `[]` (build once on mount). */
  deps?: unknown[]
}

/**
 * Convenience hook — owns the `await sdk.request(...).done()` boilerplate.
 *
 * Returns `null` while preparing; returns the built request once resolved.
 * On `deps` change or unmount, the previous in-flight build is discarded
 * (no setState after unmount; no race between two builds resolving out of order).
 */
export function useZKPassportRequest(
  sdk: ZKPassportLike,
  options: UseZKPassportRequestOptions,
): ZKPassportRequestLike | null {
  // PR 1 stub. Real implementation lands in PR 3.
  void sdk
  void options
  throw new Error("@zkpassport/ui: useZKPassportRequest() not implemented in PR 1 scaffolding")
}
