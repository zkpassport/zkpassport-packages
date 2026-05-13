// Per the design doc, this hook is the one place in `@zkpassport/ui` that
// imports types from `@zkpassport/sdk`. The SDK is a `peerDependency` (see
// package.json), and these are `import type` statements only — erased at
// build time, so no runtime coupling and no impact on bundle size.
//
// The vanilla / core surface stays duck-typed (see ZKPassportRequestLike in
// core/types.ts) so non-React consumers don't need the SDK installed at all.

import type { QueryBuilder, QueryBuilderResult, ZKPassport } from "@zkpassport/sdk"

export type UseZKPassportRequestOptions = {
  /** Passed straight to `sdk.request({...})`. */
  service: { name: string; logo: string; purpose: string; scope?: string }
  /** Apply gates to the builder. Return the chained builder. */
  query: (builder: QueryBuilder) => QueryBuilder
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
  sdk: ZKPassport,
  options: UseZKPassportRequestOptions,
): QueryBuilderResult | null {
  // PR 1 stub. Real implementation lands in PR 3.
  void sdk
  void options
  throw new Error("@zkpassport/ui: useZKPassportRequest() not implemented in PR 1 scaffolding")
}
