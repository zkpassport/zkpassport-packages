// Per the design doc, this hook is the one place in `@zkpassport/ui` that
// imports types from `@zkpassport/sdk`. The SDK is a `peerDependency` (see
// package.json), and these are `import type` statements only — erased at
// build time, so no runtime coupling and no impact on bundle size.
//
// The `sdk` parameter is typed as `ZKPassportLike` (a structural subset of
// the `ZKPassport` class) rather than the concrete class. TypeScript treats
// classes with private members nominally, so when the UI package's types are
// built against one `@zkpassport/sdk` version and a consumer's app uses a
// different one (or a locally-linked workspace copy), passing a `ZKPassport`
// instance fails with "missing private fields" even though the runtime is
// fine. Picking only the method we actually need drops the nominal identity.
//
// The vanilla / core surface stays duck-typed (see ZKPassportRequestLike in
// core/types.ts) so non-React consumers don't need the SDK installed at all.

import { useCallback, useEffect, useRef, useState } from "react"

import { ZKP_RETRY } from "../core/retry-bridge"
import type { QueryBuilder, QueryBuilderResult, ZKPassport } from "@zkpassport/sdk"

/**
 * Structural subset of `ZKPassport` that `useZKPassportRequest` actually
 * uses. Any object exposing a compatible `request(service): Promise<QueryBuilder>`
 * method satisfies this — useful for tests/mocks too.
 */
export type ZKPassportLike = Pick<ZKPassport, "request">

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
 * Pass `sdk = null` while the SDK is still being instantiated (e.g. in SSR
 * setups where `new ZKPassport()` has to wait for `useEffect` because the
 * SDK constructor reads `window.location.hostname`). The hook returns `null`
 * until a real SDK arrives, and `<QRCard>` will sit in its `preparing` state.
 *
 * `sdk`, `service`, and `query` are read live via refs, so swapping between
 * two real SDK instances doesn't trigger a rebuild on its own. Pass `deps`
 * explicitly to control when a rebuild happens. The `null` → instance
 * transition is treated as a rebuild trigger so the first request actually
 * gets built once the SDK becomes available.
 */
export function useZKPassportRequest(
  sdk: ZKPassportLike | null,
  options: UseZKPassportRequestOptions,
): QueryBuilderResult | null {
  const { service, query, deps = [] } = options

  const [request, setRequest] = useState<QueryBuilderResult | null>(null)
  // Bumped by the `retry` function attached to each built request. The card
  // calls it on retry click via the hidden `ZKP_RETRY` symbol, which triggers
  // a rebuild without the consumer needing to wire anything up.
  const [retryNonce, setRetryNonce] = useState(0)
  const retry = useCallback(() => {
    setRetryNonce((n) => n + 1)
  }, [])

  const sdkRef = useRef(sdk)
  const serviceRef = useRef(service)
  const queryRef = useRef(query)
  sdkRef.current = sdk
  serviceRef.current = service
  queryRef.current = query

  // We want a null → instance transition to trigger a rebuild, but identity
  // swaps between two real SDKs to keep going through the ref. Tracking just
  // the presence of an SDK in the effect deps gives us both.
  const hasSdk = sdk !== null

  useEffect(() => {
    let cancelled = false
    // Flash back to `null` so consumers (e.g. <QRCard>) see the rebuild
    // as a transition to `preparing`, rather than briefly displaying a QR
    // pointing at a torn-down bridge.
    setRequest(null)

    const currentSdk = sdkRef.current
    if (!currentSdk) {
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const builder = await currentSdk.request(serviceRef.current)
        if (cancelled) return
        const built = queryRef.current(builder).done()
        if (cancelled) return
        // Attach the rebuild trigger as a non-enumerable symbol property so it
        // doesn't show up in iteration / JSON output and won't collide with
        // any SDK field. The renderer reads it back via `readRetry()`.
        Object.defineProperty(built, ZKP_RETRY, {
          value: retry,
          enumerable: false,
          configurable: true,
        })
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
    // refs above. `hasSdk` is included so the null → instance transition
    // (common with SSR-deferred SDK init) triggers exactly one rebuild.
    // `retryNonce` re-runs the effect when the card's retry button is clicked.
  }, [hasSdk, retryNonce, retry, ...deps])

  return request
}
