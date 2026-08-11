import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import QRCode from "qrcode"
import { ZKPassport } from "@zkpassport/sdk"
import type { Query, QueryBuilderResult } from "@zkpassport/sdk"

import { logger } from "./logger"
import type { ZKPassportQRCodeOptions } from "./types"

export type CardState =
  | "intro"
  | "preparing"
  | "connecting"
  | "waiting"
  | "scanned"
  | "generating"
  | "success"
  | "error"

export type ProofStreamProgress = { received: number; total: number | null }

export type UseCard = {
  state: CardState
  url: string | null
  qrSvg: string | null
  query: Query | null
  // Service branding resolved by the SDK (dashboard config), used as header fallback
  serviceName: string | null
  serviceLogo: string | null
  retry: () => void
  // Intro screen
  continueWithPhone: () => void
  proofProgress: ProofStreamProgress
}

export function useCard(options: ZKPassportQRCodeOptions): UseCard {
  const introEnabled = options.showIntroScreen === true
  const [state, setState] = useState<CardState>(introEnabled ? "intro" : "preparing")
  const [url, setUrl] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [query, setQuery] = useState<Query | null>(null)
  const [serviceName, setServiceName] = useState<string | null>(null)
  const [serviceLogo, setServiceLogo] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [proofProgress, setProofProgress] = useState<ProofStreamProgress>({
    received: 0,
    total: null,
  })

  const optionsRef = useRef(options)
  optionsRef.current = options

  const requestRef = useRef<QueryBuilderResult | null>(null)
  // The bridge/QR-flow state, tracked even while the intro screen is showing so
  // Continue lands on the right screen
  const bridgeStateRef = useRef<CardState>("preparing")
  const introActiveRef = useRef(introEnabled)

  // Held in a ref so StrictMode / Fast Refresh don't spin up a second SDK
  // and orphan the bridge the phone is already talking to.
  const sdkRef = useRef<ZKPassport | null>(null)
  if (sdkRef.current === null) {
    sdkRef.current = new ZKPassport(options.domain)
  }

  useEffect(() => {
    let cancelled = false
    let readyFired = false
    const intro = optionsRef.current.showIntroScreen === true
    introActiveRef.current = intro
    bridgeStateRef.current = "preparing"
    setState(intro ? "intro" : "preparing")
    setUrl(null)
    setQrSvg(null)
    setQuery(null)
    setServiceName(null)
    setServiceLogo(null)
    setProofProgress({ received: 0, total: null })
    requestRef.current = null

    const {
      domain: _domain,
      theme: _theme,
      showIntroScreen: _showIntroScreen,
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

    // onError is the only way to tell the host app that something went wrong
    const fail = (summary: string, reason: unknown) => {
      logger.error(reason)
      setState("error")
      const detail = reason instanceof Error ? reason.message : String(reason)
      safeCall(optionsRef.current.onError, `${summary}: ${detail}`)
    }

    const guard =
      <T extends unknown[]>(fn: (...args: T) => void) =>
      (...args: T) => {
        if (cancelled) return
        try {
          fn(...args)
        } catch (reason) {
          fail("Failed to handle a verification update", reason)
        }
      }

    // Update the QR-flow state; while the intro is showing only the ref advances
    const applyBridgeState = (next: CardState, forceShow = false) => {
      bridgeStateRef.current = next
      if (forceShow) introActiveRef.current = false
      if (!introActiveRef.current) setState(next)
    }

    sdkRef
      .current!.request({ ...sdkRequestArgs })
      .then((queryBuilder) => {
        if (cancelled) return
        let request: QueryBuilderResult
        try {
          request = buildQuery(queryBuilder)
        } catch (reason) {
          fail("Failed to build the verification query", reason)
          return
        }

        request.onBridgeConnect(
          guard(() => {
            if (bridgeStateRef.current === "preparing" || bridgeStateRef.current === "connecting") {
              applyBridgeState("waiting")
            }
            fireReady()
            safeCall(optionsRef.current.onBridgeConnect)
          }),
        )
        request.onRequestReceived(
          guard(() => {
            // The phone joined: real progress, always take over the screen
            applyBridgeState("scanned", true)
            safeCall(optionsRef.current.onRequestReceived)
          }),
        )
        request.onGeneratingProof(
          guard(() => {
            applyBridgeState("generating", true)
            safeCall(optionsRef.current.onGeneratingProof)
          }),
        )
        request.onProofGenerated(
          guard((proof) => {
            setProofProgress((progress) => ({
              received: progress.received + 1,
              total: proof.total ?? progress.total,
            }))
            safeCall(optionsRef.current.onProofGenerated, proof)
          }),
        )
        request.onResult(
          guard((response) => {
            introActiveRef.current = false
            setState(response.verified ? "success" : "error")
            safeCall(optionsRef.current.onResult, response)
          }),
        )
        request.onReject(
          guard(() => {
            introActiveRef.current = false
            setState("error")
            safeCall(optionsRef.current.onReject)
          }),
        )
        request.onError(
          guard((message) => {
            introActiveRef.current = false
            setState("error")
            safeCall(optionsRef.current.onError, message)
          }),
        )
        requestRef.current = request
        setQuery(request.query)
        // Branding resolved by the SDK (options first, then dashboard config)
        try {
          const service = sdkRef.current!.getServiceDetails(request.requestId)
          if (service) {
            setServiceName(service.name || null)
            setServiceLogo(service.logo || null)
          }
        } catch (reason) {
          logger.error(reason)
        }

        // Catch up to any events that fired before we subscribed.
        try {
          if (request.requestReceived()) applyBridgeState("scanned", true)
          else if (request.isBridgeConnected()) {
            applyBridgeState("waiting")
            fireReady()
          } else applyBridgeState("connecting")
        } catch (reason) {
          fail("Failed to check the verification state", reason)
        }

        setUrl(request.url)
        try {
          setQrSvg(renderQrSvg(request.url))
        } catch (reason) {
          fail("Failed to render the QR code", reason)
        }
      })
      .catch((reason) => {
        if (cancelled) return
        fail("Failed to start the verification request", reason)
      })

    return () => {
      cancelled = true
    }
  }, [retryNonce])

  const retry = useCallback(() => {
    safeCall(optionsRef.current.onRetryClicked)
    setRetryNonce((n) => n + 1)
  }, [])

  // Intro → QR screen (phone flow)
  const continueWithPhone = useCallback(() => {
    introActiveRef.current = false
    setState(bridgeStateRef.current)
  }, [])

  return {
    state,
    url,
    qrSvg,
    query,
    serviceName,
    serviceLogo,
    retry,
    continueWithPhone,
    proofProgress,
  }
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
