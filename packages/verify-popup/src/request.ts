import { useCallback, useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import {
  ZKPassport,
  type ProofResult,
  type Query,
  type QueryBuilder,
  type QueryBuilderResult,
  type QueryResult,
} from "@zkpassport/sdk"
import { hydrateQueryBuilder, type PopupRequestConfig } from "@zkpassport/sdk/popup"

// Stops at `waiting`: everything after the phone joins is a screen, not a state
export type RequestState = "preparing" | "connecting" | "waiting"

export type QuerySource = Query | ((builder: QueryBuilder) => QueryBuilderResult)

export type RequestOptions = Omit<PopupRequestConfig, "uniqueIdentifierType"> & {
  // Wider than the popup protocol's: the credential flow may ask for NONE
  uniqueIdentifierType?: Parameters<ZKPassport["request"]>[0]["uniqueIdentifierType"]
  verifierMode?: "local" | "api" | "auto"
}

export type RequestConfig = {
  domain: string
  request: RequestOptions
  query: QuerySource
}

export type RequestCallbacks = {
  onReceived?: () => void
  onProving?: () => void
  onProof?: (proof: ProofResult) => void
  onSuccess?: (response: { proofs: ProofResult[]; result: QueryResult }) => void
  // The credential flow needs onResult's verified payload to build its issue call
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onResult?: (result: any) => void
  onReject?: () => void
  onError?: (message: string) => void
}

export type RequestHandle = {
  state: RequestState
  url: string | null
  qrSvg: string | null
  query: Query | null
  retry: () => void
}

export function useRequest(config: RequestConfig, callbacks: RequestCallbacks): RequestHandle {
  const [state, setState] = useState<RequestState>("preparing")
  const [url, setUrl] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [query, setQuery] = useState<Query | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Read through refs so a re-render never restarts the request
  const configRef = useRef(config)
  configRef.current = config
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  useEffect(() => {
    const { domain, request: options, query: wanted } = configRef.current
    const sdk = new ZKPassport(domain)
    let cancelled = false
    let requestId: string | null = null

    const fail = (summary: string, reason: unknown) => {
      const detail = reason instanceof Error ? reason.message : String(reason)
      callbacksRef.current.onError?.(`${summary}: ${detail}`)
    }

    setState("preparing")
    setUrl(null)
    setQrSvg(null)
    setQuery(null)

    sdk
      .request({
        name: options.name || domain,
        logo: options.logo,
        purpose: options.purpose,
        scope: options.scope,
        mode: options.mode,
        devMode: options.devMode,
        validity: options.validity,
        uniqueIdentifierType: options.uniqueIdentifierType,
        oprfKeyId: options.oprfKeyId,
        verifierMode: options.verifierMode ?? "api",
      })
      .then((builder) => {
        const built = options.policyId
          ? builder.policy(options.policyId).done()
          : typeof wanted === "function"
            ? wanted(builder)
            : hydrateQueryBuilder(builder, wanted)

        // An empty query would render as a consent screen that asks for nothing
        if (Object.keys(built.query).length === 0) {
          throw new Error("The verification request asks for nothing. Set a query or a policyId.")
        }
        // The bridge is live now, so a popup that closed mid-flight still hangs up
        requestId = built.requestId
        if (cancelled) {
          sdk.cancelRequest(built.requestId)
          return
        }

        built.onBridgeConnect(() => setState((s) => (s === "waiting" ? s : "waiting")))
        built.onBridgeConnectionLost(() =>
          callbacksRef.current.onError?.("The connection to your phone was lost."),
        )
        built.onRequestReceived(() => callbacksRef.current.onReceived?.())
        built.onGeneratingProof(() => callbacksRef.current.onProving?.())
        built.onProofGenerated((proof) => callbacksRef.current.onProof?.(proof))
        if (callbacksRef.current.onResult) {
          built.onResult((result) => callbacksRef.current.onResult?.(result))
        } else {
          built.onSuccess((response) => callbacksRef.current.onSuccess?.(response))
        }
        built.onReject(() => callbacksRef.current.onReject?.())
        built.onError((message) => callbacksRef.current.onError?.(message))

        setQuery(built.query)
        // Events can fire before the handlers above are attached
        if (built.requestReceived()) callbacksRef.current.onReceived?.()
        else setState(built.isBridgeConnected() ? "waiting" : "connecting")

        setUrl(built.url)
        try {
          setQrSvg(renderQrSvg(built.url))
        } catch (reason) {
          fail("Failed to render the QR code", reason)
        }
      })
      .catch((reason) => {
        if (cancelled) return
        const detail = reason instanceof Error ? reason.message : String(reason)
        callbacksRef.current.onError?.(detail)
      })

    return () => {
      cancelled = true
      if (requestId) sdk.cancelRequest(requestId)
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { state, url, qrSvg, query, retry }
}

// ECC "Q" leaves room for the mark overlaid at the centre
function renderQrSvg(url: string): string {
  const qr = QRCode.create(url, { errorCorrectionLevel: "Q" })
  const size = qr.modules.size
  const data = qr.modules.data
  const cell = 100 / size
  const fmt = (n: number) => n.toFixed(3)

  const finderOrigins: Array<[number, number]> = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]
  const isInFinder = (r: number, c: number) =>
    finderOrigins.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7)

  let body = ""
  const dotRadius = cell * 0.47
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!data[r * size + c]) continue
      if (isInFinder(r, c)) continue
      body += `<circle cx="${fmt((c + 0.5) * cell)}" cy="${fmt((r + 0.5) * cell)}" r="${fmt(dotRadius)}"/>`
    }
  }

  let finders = ""
  for (const [fr, fc] of finderOrigins) {
    const cx = (fc + 3.5) * cell
    const cy = (fr + 3.5) * cell
    finders +=
      `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(cell * 3)}" ` +
      `fill="none" stroke="currentColor" stroke-width="${fmt(cell)}"/>` +
      `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(cell * 1.5)}"/>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ` +
    `shape-rendering="geometricPrecision" fill="currentColor">${finders}${body}</svg>`
  )
}
