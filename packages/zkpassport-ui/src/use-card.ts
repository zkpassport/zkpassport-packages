import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import QRCode from "qrcode"
import { ZKPassport } from "@zkpassport/sdk"
import type { QueryBuilderResult } from "@zkpassport/sdk"

import type { ZKPassportQRCodeOptions } from "./types"

export type CardState =
  | "preparing"
  | "connecting"
  | "waiting"
  | "scanned"
  | "generating"
  | "success"
  | "error"

export type UseCard = {
  state: CardState
  url: string | null
  qrSvg: string | null
  retry: () => void
}

export function useCard(options: ZKPassportQRCodeOptions): UseCard {
  const [state, setState] = useState<CardState>("preparing")
  const [url, setUrl] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const optionsRef = useRef(options)
  optionsRef.current = options

  // Held in a ref so StrictMode / Fast Refresh don't spin up a second SDK
  // and orphan the bridge the phone is already talking to.
  const sdkRef = useRef<ZKPassport | null>(null)
  if (sdkRef.current === null) {
    sdkRef.current = new ZKPassport(options.domain)
  }

  useEffect(() => {
    let cancelled = false
    let readyFired = false
    setState("preparing")
    setUrl(null)
    setQrSvg(null)

    const {
      domain: _domain,
      theme: _theme,
      query: buildQuery,
      onReady: _onReady,
      onRetryClicked: _onRetryClicked,
      onBridgeConnect: _onBridgeConnect,
      onRequestReceived: _onRequestReceived,
      onGeneratingProof: _onGeneratingProof,
      onProofGenerated: _onProofGenerated,
      onResult: _onResult,
      onReject: _onReject,
      onError: _onError,
      ...sdkRequestArgs
    } = optionsRef.current

    const fireReady = () => {
      if (readyFired) return
      readyFired = true
      safeCall(optionsRef.current.onReady)
    }

    const guard =
      <T extends unknown[]>(fn: (...args: T) => void) =>
      (...args: T) => {
        if (cancelled) return
        try {
          fn(...args)
        } catch (reason) {
          console.error(reason)
          setState("error")
        }
      }

    sdkRef
      .current!.request(sdkRequestArgs)
      .then((queryBuilder) => {
        if (cancelled) return
        let request: QueryBuilderResult
        try {
          request = buildQuery(queryBuilder)
        } catch (reason) {
          console.error(reason)
          setState("error")
          return
        }

        request.onBridgeConnect(
          guard(() => {
            setState((s) => (s === "preparing" || s === "connecting" ? "waiting" : s))
            fireReady()
            safeCall(optionsRef.current.onBridgeConnect)
          }),
        )
        request.onRequestReceived(
          guard(() => {
            setState("scanned")
            safeCall(optionsRef.current.onRequestReceived)
          }),
        )
        request.onGeneratingProof(
          guard(() => {
            setState("generating")
            safeCall(optionsRef.current.onGeneratingProof)
          }),
        )
        request.onProofGenerated(
          guard((proof) => {
            safeCall(optionsRef.current.onProofGenerated, proof)
          }),
        )
        request.onResult(
          guard((response) => {
            setState(response.verified ? "success" : "error")
            safeCall(optionsRef.current.onResult, response)
          }),
        )
        request.onReject(
          guard(() => {
            setState("error")
            safeCall(optionsRef.current.onReject)
          }),
        )
        request.onError(
          guard((message) => {
            setState("error")
            safeCall(optionsRef.current.onError, message)
          }),
        )

        // Catch up to any events that fired before we subscribed.
        try {
          if (request.requestReceived()) setState("scanned")
          else if (request.isBridgeConnected()) {
            setState("waiting")
            fireReady()
          } else setState("connecting")
        } catch (reason) {
          console.error(reason)
          setState("error")
        }

        setUrl(request.url)
        try {
          setQrSvg(renderQrSvg(request.url))
        } catch (reason) {
          console.error(reason)
          setState("error")
        }
      })
      .catch((reason) => {
        if (cancelled) return
        console.error(reason)
        setState("error")
      })

    return () => {
      cancelled = true
    }
  }, [retryNonce])

  const retry = useCallback(() => {
    safeCall(optionsRef.current.onRetryClicked)
    setRetryNonce((n) => n + 1)
  }, [])

  return { state, url, qrSvg, retry }
}

// Circular dot modules + concentric-ring finder patterns (Apple/Spotify style).
// ECC "H" tolerates ~30% damage, leaving room for the center logo overlay.
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
      const cx = (c + 0.5) * cell
      const cy = (r + 0.5) * cell
      body += `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(dotRadius)}"/>`
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

function safeCall<A extends unknown[]>(
  fn: ((...args: A) => void) | undefined | null,
  ...args: A
): void {
  if (!fn) return
  try {
    fn(...args)
  } catch {
    // Swallow consumer errors.
  }
}
