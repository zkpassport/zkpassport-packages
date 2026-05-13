// Per the design doc, this hook is the one place in `@zkpassport/ui` that
// imports types from `@zkpassport/sdk`. The SDK is a `peerDependency` (see
// package.json), and these are `import type` statements only — erased at
// build time, so no runtime coupling and no impact on bundle size.
//
// The vanilla / core surface stays duck-typed (see ZKPassportRequestLike in
// core/types.ts) so non-React consumers don't need the SDK installed at all.

import { useEffect, useRef, useState } from "react"

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
 *
 * `sdk`, `service`, and `query` are read live via refs, so they always reflect
 * the latest values without triggering a rebuild on their own. Pass `deps`
 * explicitly to control when a rebuild happens.
 */
export function useZKPassportRequest(
  sdk: ZKPassport,
  options: UseZKPassportRequestOptions,
): QueryBuilderResult | null {
  const { service, query, deps = [] } = options

  const [request, setRequest] = useState<QueryBuilderResult | null>(null)

  const sdkRef = useRef(sdk)
  const serviceRef = useRef(service)
  const queryRef = useRef(query)
  sdkRef.current = sdk
  serviceRef.current = service
  queryRef.current = query

  useEffect(() => {
    let cancelled = false
    // Flash back to `null` so consumers (e.g. <QRCard>) see the rebuild
    // as a transition to `preparing`, rather than briefly displaying a QR
    // pointing at a torn-down bridge.
    setRequest(null)

    void (async () => {
      try {
        const builder = await sdkRef.current.request(serviceRef.current)
        if (cancelled) return
        const built = queryRef.current(builder).done()
        if (cancelled) return
        setRequest(built)
      } catch (cause) {
        if (cancelled) return
        // The hook's public surface is `QueryBuilderResult | null`. Surface
        // the failure via the console so it's debuggable; downstream errors
        // (e.g. bridge failures after the request is live) flow through
        // <QRCard>'s `onError` callback.
        console.error("[@zkpassport/ui] useZKPassportRequest: failed to build request", cause)
      }
    })()

    return () => {
      cancelled = true
    }
    // `deps` is the canonical rebuild signal; sdk/service/query are read via
    // refs above so they don't need to be in the dependency array.
  }, deps)

  return request
}
