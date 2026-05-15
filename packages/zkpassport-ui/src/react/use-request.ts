// Only place in the package that imports from `@zkpassport/sdk`. Types-only,
// erased at build, so no runtime coupling. The `sdk` parameter is typed as a
// structural subset (`ZKPassportLike`) rather than the concrete class — TS
// compares classes with private members nominally, so a `ZKPassport` arg
// from a different SDK copy (workspace link, version skew) would fail with
// "missing private fields" even when the runtime shape matches.

import { useCallback, useEffect, useRef, useState } from "react"

import { ZKP_RETRY } from "../core/retry-bridge"
import { ZKP_SERVICE } from "../core/service-bridge"
import type { QueryBuilder, QueryBuilderResult, ZKPassport } from "@zkpassport/sdk"

/** Structural subset — anything with a compatible `request(service)` matches. */
export type ZKPassportLike = Pick<ZKPassport, "request">

export type UseZKPassportRequestOptions = {
  /** Passed straight to `sdk.request({...})`. */
  service: { name: string; logo: string; purpose: string; scope?: string }
  /** Apply gates and return the chained builder — its `.done()` is called for you. */
  query: (builder: QueryBuilder) => QueryBuilder
  /** Re-runs the request build when any value changes. Default: `[]` (build once on mount). */
  deps?: unknown[]
}

/**
 * Owns the `await sdk.request(...).done()` boilerplate. Returns `null` while
 * preparing; the built request once resolved.
 *
 * Pass `sdk = null` while it's still being instantiated (e.g. SSR where
 * `new ZKPassport()` waits for `useEffect`). The hook holds at `null` until
 * a real SDK arrives.
 *
 * `sdk` / `service` / `query` are read live via refs — pass `deps` to control
 * when a rebuild happens. The `null` → instance transition rebuilds once.
 */
export function useZKPassportRequest(
  sdk: ZKPassportLike | null,
  options: UseZKPassportRequestOptions,
): QueryBuilderResult | null {
  const { service, query, deps = [] } = options

  const [request, setRequest] = useState<QueryBuilderResult | null>(null)
  // Bumped by the retry hook attached via ZKP_RETRY; re-runs the build effect.
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

  // Tracking presence (not identity) means a null → instance transition
  // rebuilds, but identity swaps between two real SDKs don't.
  const hasSdk = sdk !== null

  useEffect(() => {
    let cancelled = false
    // Flash back to `null` so the card transitions to `preparing` instead of
    // briefly showing a QR pointing at a torn-down bridge.
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
        // Non-enumerable symbol props so they don't show up in iteration /
        // JSON output and can't collide with any SDK field. The card reads
        // them back via `readRetry()` and `readService()`.
        Object.defineProperty(built, ZKP_RETRY, {
          value: retry,
          enumerable: false,
          configurable: true,
        })
        const svc = serviceRef.current
        Object.defineProperty(built, ZKP_SERVICE, {
          value: { name: svc.name, logo: svc.logo },
          enumerable: false,
          configurable: true,
        })
        setRequest(built)
      } catch (cause) {
        if (cancelled) return
        // The public surface is `QueryBuilderResult | null` — log so the
        // failure is debuggable. Errors after the request is live flow through
        // `<QRCard>`'s `onError` instead.
        console.error("[@zkpassport/ui] useZKPassportRequest: failed to build request", cause)
      }
    })()

    return () => {
      cancelled = true
    }
    // sdk/service/query are read via refs; `deps` is the explicit rebuild
    // signal. `hasSdk` covers the null → instance transition; `retryNonce`
    // covers the card's retry button.
  }, [hasSdk, retryNonce, retry, ...deps])

  return request
}
