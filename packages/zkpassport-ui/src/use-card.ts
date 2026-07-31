import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import QRCode from "qrcode"
import { ZKPassport } from "@zkpassport/sdk"
import { verifyViaApi } from "@zkpassport/sdk/api-verifier"
import { isEnrollmentStorageSupported } from "@zkpassport/sdk/enrollment"
import type {
  EnrollmentAvailableActions,
  LocalProofProgress,
  Query,
  QueryBuilderResult,
  SavedEnrollment,
} from "@zkpassport/sdk"

import { logger } from "./logger"
import type { HostedEnrollmentOptions, ZKPassportQRCodeOptions } from "./types"

export type CardState =
  | "intro"
  | "preparing"
  | "connecting"
  | "waiting"
  | "scanned"
  | "generating"
  | "local-proving"
  | "save-offer"
  | "success"
  | "error"

// Which path the user is on: phone (QR/bridge) or browser (local proving)
export type CardFlow = "phone" | "browser"

export type ProofStreamProgress = { received: number; total: number | null }

export type UseCard = {
  state: CardState
  flow: CardFlow
  url: string | null
  qrSvg: string | null
  query: Query | null
  // Service branding resolved by the SDK (dashboard config), used as header fallback
  serviceName: string | null
  serviceLogo: string | null
  retry: () => void
  // Intro screen
  continueWithPhone: () => void
  // Browser enrollment
  storageSupported: boolean
  savedEnrollments: SavedEnrollment[]
  // Masked holder name of the ID pending the post-verification save
  pendingSaveName: string | null
  // Saved ID currently proving in place on the intro screen
  localProvingId: string | null
  localProgress: LocalProofProgress | null
  proofProgress: ProofStreamProgress
  rememberInBrowser: boolean
  setRememberInBrowser: (value: boolean) => void
  fallbackNotice: string | null
  verifyLocally: (enrollmentId: string) => void
  saveEnrollment: () => void
  declineEnrollment: () => void
  removeSavedId: (enrollmentId: string) => void
}

export function useCard(options: ZKPassportQRCodeOptions): UseCard {
  const introEnabled = options.display?.intro !== false
  const [state, setState] = useState<CardState>(introEnabled ? "intro" : "preparing")
  const [flow, setFlow] = useState<CardFlow>("phone")
  const [url, setUrl] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [query, setQuery] = useState<Query | null>(null)
  const [serviceName, setServiceName] = useState<string | null>(null)
  const [serviceLogo, setServiceLogo] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [storageSupported, setStorageSupported] = useState(false)
  const [savedEnrollments, setSavedEnrollments] = useState<SavedEnrollment[]>([])
  const [pendingSaveName, setPendingSaveName] = useState<string | null>(null)
  const [localProgress, setLocalProgress] = useState<LocalProofProgress | null>(null)
  // Saved ID currently proving in place on the intro screen
  const [localProvingId, setLocalProvingId] = useState<string | null>(null)
  const [proofProgress, setProofProgress] = useState<ProofStreamProgress>({
    received: 0,
    total: null,
  })
  const [rememberInBrowser, setRememberInBrowserState] = useState(true)
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options

  const requestRef = useRef<QueryBuilderResult | null>(null)
  const enrollmentActionsRef = useRef<EnrollmentAvailableActions | null>(null)
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
    const intro = optionsRef.current.display?.intro !== false
    introActiveRef.current = intro
    bridgeStateRef.current = "preparing"
    setState(intro ? "intro" : "preparing")
    setFlow("phone")
    setUrl(null)
    setQrSvg(null)
    setQuery(null)
    setServiceName(null)
    setServiceLogo(null)
    setSavedEnrollments([])
    setPendingSaveName(null)
    setLocalProgress(null)
    setLocalProvingId(null)
    setProofProgress({ received: 0, total: null })
    setFallbackNotice(null)
    requestRef.current = null
    enrollmentActionsRef.current = null

    const {
      domain: _domain,
      theme: _theme,
      verification: _verification,
      verificationApiUrl: _verificationApiUrl,
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
      onEnrollmentOffered: _onEnrollmentOffered,
      onEnrollmentSaved: _onEnrollmentSaved,
      onEnrollmentDeclined: _onEnrollmentDeclined,
      onLocalVerificationStart: _onLocalVerificationStart,
      onLocalVerificationFallback: _onLocalVerificationFallback,
      hostedEnrollment: _hostedEnrollment,
      ...sdkRequestArgs
    } = optionsRef.current as ZKPassportQRCodeOptions & HostedEnrollmentOptions

    // Browser enrollment is only active in the hosted verification popup, where
    // saved IDs live on the shared verify origin and work for every relying
    // party. Embedded cards are QR-only and never request an enrollment bundle
    // from the phone.
    const enrollmentEnabled = () =>
      !!optionsRef.current.enableBrowserEnrollment &&
      (optionsRef.current as HostedEnrollmentOptions).hostedEnrollment === true

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
          logger.error(reason)
          setState("error")
        }
      }

    // Update the QR-flow state; while the intro is showing only the ref advances
    const applyBridgeState = (next: CardState, forceShow = false) => {
      bridgeStateRef.current = next
      if (forceShow) introActiveRef.current = false
      if (!introActiveRef.current) setState(next)
    }

    if (enrollmentEnabled()) {
      isEnrollmentStorageSupported()
        .then((supported) => {
          if (!cancelled) setStorageSupported(supported)
        })
        .catch(() => {})
    } else {
      if (optionsRef.current.enableBrowserEnrollment) {
        logger.warn(
          "enableBrowserEnrollment has no effect on the embedded card: saved IDs live in " +
            "the hosted verification popup. Use <VerifyWithZKPassportButton> instead.",
        )
      }
      setStorageSupported(false)
    }

    sdkRef
      .current!.request({
        ...sdkRequestArgs,
        enableBrowserEnrollment: enrollmentEnabled(),
        // The published card never verifies proofs in the browser (no bb.js/WASM):
        // `verified` comes from the verification API when verification: "api" is
        // set, and is undefined otherwise. Real trust comes from server-side
        // verification. Only the hosted popup (which ships the full SDK) verifies
        // in place via the internal hostedVerification flag.
        skipProofVerification:
          (optionsRef.current as HostedEnrollmentOptions).hostedVerification !== true,
      })
      .then((queryBuilder) => {
        if (cancelled) return
        let request: QueryBuilderResult
        try {
          request = buildQuery(queryBuilder)
        } catch (reason) {
          logger.error(reason)
          setState("error")
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
            if (bridgeStateRef.current !== "local-proving") {
              applyBridgeState("generating", true)
            }
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
            // The public-input consistency checks run in the SDK regardless of the
            // verification mode; a definite failure is always an error
            if (response.verified === false) {
              setState("error")
              safeCall(optionsRef.current.onResult, response)
              return
            }
            if (optionsRef.current.verification !== "api") {
              // Proofs received and consistent; not verified in the browser
              // (verified is undefined) — the integrator verifies server-side
              setState("success")
              safeCall(optionsRef.current.onResult, response)
              return
            }
            // "api" mode: ask the hosted verification API before reporting
            verifyViaApi(
              {
                domain: optionsRef.current.domain ?? window.location.hostname,
                proofs: response.proofs,
                query: request.query,
                queryResult: response.result,
                scope: optionsRef.current.scope,
                validity: optionsRef.current.validity,
                devMode: optionsRef.current.devMode,
                oprfKeyId: optionsRef.current.oprfKeyId,
              },
              { apiUrl: optionsRef.current.verificationApiUrl },
            )
              .then((apiResult) => {
                if (cancelled) return
                // Unreachable API (verified undefined) still shows success: the
                // proofs arrived and were consistent; only an explicit "false"
                // from the API is a failure
                setState(apiResult.verified === false ? "error" : "success")
                safeCall(optionsRef.current.onResult, {
                  ...response,
                  verified: apiResult.verified,
                })
              })
              .catch(() => {
                // verifyViaApi resolves on all failure paths; this is a safety net
                if (cancelled) return
                setState("success")
                safeCall(optionsRef.current.onResult, response)
              })
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
        request.onEnrollmentAvailable(
          guard((actions) => {
            if (optionsRef.current.display?.browserVerification === false) {
              actions.discard()
              return
            }
            enrollmentActionsRef.current = actions
            setPendingSaveName(actions.maskedName)
            setState("save-offer")
            safeCall(optionsRef.current.onEnrollmentOffered)
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

        // When browser enrollment is enabled and this browser holds usable
        // enrollments, the intro offers verifying locally with them
        if (enrollmentEnabled() && optionsRef.current.display?.browserVerification !== false) {
          sdkRef
            .current!.getEnrollmentStatus(request.requestId)
            .then((status) => {
              if (cancelled) return
              if (status.available) {
                setSavedEnrollments(status.enrollments)
              }
            })
            .catch((reason) => logger.error(reason))
        }

        // Catch up to any events that fired before we subscribed.
        try {
          if (request.requestReceived()) applyBridgeState("scanned", true)
          else if (request.isBridgeConnected()) {
            applyBridgeState("waiting")
            fireReady()
          } else applyBridgeState("connecting")
        } catch (reason) {
          logger.error(reason)
          setState("error")
        }

        setUrl(request.url)
        try {
          setQrSvg(renderQrSvg(request.url))
        } catch (reason) {
          logger.error(reason)
          setState("error")
        }
      })
      .catch((reason) => {
        if (cancelled) return
        logger.error(reason)
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

  // Intro → QR screen (phone flow)
  const continueWithPhone = useCallback(() => {
    introActiveRef.current = false
    setFlow("phone")
    setFallbackNotice(null)
    setState(bridgeStateRef.current)
  }, [])

  // Toggle the "remember in this browser" checkbox: flips be=1 in the request URL
  // (so the phone only offers enrollment when checked) and re-renders the QR
  const setRememberInBrowser = useCallback((value: boolean) => {
    setRememberInBrowserState(value)
    const request = requestRef.current
    if (!sdkRef.current || !request) return
    try {
      sdkRef.current.setBrowserEnrollment(request.requestId, value)
      const nextUrl = sdkRef.current.getUrl(request.requestId)
      setUrl(nextUrl)
      setQrSvg(renderQrSvg(nextUrl))
    } catch (reason) {
      logger.error(reason)
    }
  }, [])

  // Must be invoked from the button's click handler: the passkey assertion
  // requires user activation.
  const verifyLocally = useCallback((enrollmentId: string) => {
    const request = requestRef.current
    if (!sdkRef.current || !request) return
    safeCall(optionsRef.current.onLocalVerificationStart)
    // With the intro visible, proving runs in place: the clicked ID row shows a
    // spinner and the intro stays on screen (no QR flash). Without the intro
    // (display.intro false), the dedicated local-proving screen is used.
    const inline = introActiveRef.current
    setFlow("browser")
    setFallbackNotice(null)
    setLocalProgress(null)
    setLocalProvingId(enrollmentId)
    if (!inline) {
      introActiveRef.current = false
      bridgeStateRef.current = "local-proving"
      setState("local-proving")
    }
    sdkRef
      .current!.verifyLocally(request.requestId, {
        enrollmentId,
        onProgress: (progress) => setLocalProgress(progress),
      })
      // onResult moves the state to success/error
      .then(() => {
        setLocalProvingId(null)
      })
      .catch((reason) => {
        logger.error(reason)
        setSavedEnrollments((enrollments) => enrollments.filter((e) => e.id !== enrollmentId))
        setLocalProgress(null)
        setLocalProvingId(null)
        setFlow("phone")
        if (inline) {
          // Stay on the intro; the error shows below the saved IDs
          setFallbackNotice("Couldn't verify with this saved ID. Try again or use your phone.")
        } else {
          // Fall back to the QR flow (never the terminal error state)
          setFallbackNotice("Couldn't verify with this browser. Use your phone instead.")
          bridgeStateRef.current = "waiting"
          setState("waiting")
        }
        safeCall(
          optionsRef.current.onLocalVerificationFallback,
          String((reason as Error)?.message ?? reason),
        )
      })
  }, [])

  // Must be invoked from the button's click handler: the passkey creation
  // requires user activation.
  const saveEnrollment = useCallback(() => {
    const actions = enrollmentActionsRef.current
    enrollmentActionsRef.current = null
    setState("success")
    if (!actions) return
    actions
      .save()
      .then((saved) => {
        safeCall(
          saved ? optionsRef.current.onEnrollmentSaved : optionsRef.current.onEnrollmentDeclined,
        )
      })
      .catch((reason) => {
        logger.error(reason)
        safeCall(optionsRef.current.onEnrollmentDeclined)
      })
  }, [])

  const declineEnrollment = useCallback(() => {
    enrollmentActionsRef.current?.discard()
    enrollmentActionsRef.current = null
    safeCall(optionsRef.current.onEnrollmentDeclined)
    setState("success")
  }, [])

  // Delete one saved ID (intro screen row action)
  const removeSavedId = useCallback((enrollmentId: string) => {
    setSavedEnrollments((enrollments) => enrollments.filter((e) => e.id !== enrollmentId))
    sdkRef.current?.deleteEnrollment(enrollmentId).catch((reason) => logger.error(reason))
  }, [])

  return {
    state,
    flow,
    url,
    qrSvg,
    query,
    serviceName,
    serviceLogo,
    retry,
    continueWithPhone,
    storageSupported,
    savedEnrollments,
    pendingSaveName,
    localProvingId,
    localProgress,
    proofProgress,
    rememberInBrowser,
    setRememberInBrowser,
    fallbackNotice,
    verifyLocally,
    saveEnrollment,
    declineEnrollment,
    removeSavedId,
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
