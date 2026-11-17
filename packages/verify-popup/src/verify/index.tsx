import { useEffect, useState } from "react"
import type { QueryBuilderResult } from "@zkpassport/sdk"
import type { PopupConfigureMessage } from "@zkpassport/sdk/popup"

import type { OutgoingEvent } from "../app"
import { FlowCard } from "../shared/flow-card"
import { Done } from "../shared/done"
import { useConfirmClose } from "../shared/use-confirm-close"
import { useContinueToAppClip } from "../shared/use-open-app"
import { ErrorScreen } from "../shared/error"
import { resolveTrustedDomain } from "../shared/trusted-domain"
import { useRequest } from "../request"
import { readSession, updateSession, type Session } from "../session"
import { Intro } from "./intro"
import { codeReplaced, codeShown, type Attempts } from "./lane"
import { describePhoneError } from "./phone-errors"
import { Scan } from "./scan"
import { useRequestUrl } from "./use-request-url"
import { Waiting, withProof, type ScanProgress } from "./waiting"

/** A rejected promise on `success` keeps the result from being shown as verified. */
export type SendEvent = (message: OutgoingEvent) => void | Promise<void>

type VerifyFlowProps = {
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  // Hostname of the relying party page; the header falls back to it when no name is sent
  rpHost: string
  session: Session
  send: SendEvent
}

type DomainResolution = { domain: string } | { error: string } | null

type Failure = {
  title?: string
  message: string
  // The raw reason, kept for a bug report but folded away from the explanation
  detail?: string
  retryLabel?: string
  keepsBridge?: boolean
  explained?: boolean
}

/**
 * Settles which domain the request is made under before anything is sent to the bridge: the
 * attested host, or a claimed one the dashboard vouches for.
 */
export function VerifyFlow({ request, query, rpHost, session, send }: VerifyFlowProps) {
  const [resolution, setResolution] = useState<DomainResolution>(null)
  const [attempt, setAttempt] = useState(0)
  const appName = request.name || rpHost

  useEffect(() => {
    let cancelled = false
    setResolution(null)
    resolveTrustedDomain(request.domain, rpHost).then(
      (domain) => {
        if (!cancelled) setResolution({ domain })
      },
      (reason: unknown) => {
        if (cancelled) return
        const message = reason instanceof Error ? reason.message : String(reason)
        setResolution({ error: message })
        send({ type: "error", message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (resolution && "error" in resolution) {
    return (
      <FlowCard name={appName} logo={request.logo} screenKey="error">
        <ErrorScreen
          title="This site isn’t set up yet"
          message={`${appName} can’t use ZKPassport verification from this page yet.`}
          detail={resolution.error}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </FlowCard>
    )
  }

  if (!resolution) {
    return (
      <FlowCard name={appName} logo={request.logo} screenKey="intro">
        <Intro appName={appName} query={null} purpose={request.purpose} onContinue={() => {}} />
      </FlowCard>
    )
  }

  return (
    <VerifyRequest
      domain={resolution.domain}
      request={request}
      query={query}
      appName={appName}
      logo={request.logo}
      session={session}
      send={send}
    />
  )
}

type VerifyRequestProps = {
  domain: string
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  appName: string
  logo?: string
  session: Session
  send: SendEvent
  onRequestCreated?: (
    request: QueryBuilderResult,
    info: { resumed: boolean },
  ) => void | Promise<void>
}

export function VerifyRequest({
  domain,
  request,
  query,
  appName,
  logo,
  session,
  send,
  onRequestCreated,
}: VerifyRequestProps) {
  // Coming back to this page should not ask for anything the user has already done
  const [consented, setConsented] = useState(session.resumed)
  // A dashboard policy arrives as {}: the real checks come back from the SDK
  const hasQuery = Object.keys(query ?? {}).length > 0
  const [scan, setScan] = useState<ScanProgress | null>(() => progressSoFar(session))
  const [unconfirmed, setUnconfirmed] = useState(scan !== null)
  const [verified, setVerified] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [attempts, setAttempts] = useState<Attempts>(() => {
    const stored = readSession(session)
    return { codeOnScreen: stored?.codeOnScreen, stalledAttempts: stored?.stalledAttempts }
  })

  const recordAttempts = (next: Attempts) => {
    if (next === attempts) return
    setAttempts(next)
    updateSession(session, {
      codeOnScreen: next.codeOnScreen,
      stalledAttempts: next.stalledAttempts,
    })
  }

  const failWith = (reason: Failure) => {
    setScan(null)
    // Without the bridge the phone cannot still be working, so forget how far it got
    if (!reason.keepsBridge) updateSession(session, { stage: undefined })
    setFailure(reason)
  }

  const failFrom = (reason: unknown) =>
    failWith({ message: reason instanceof Error ? reason.message : String(reason) })

  // Nothing reports a phone that has gone quiet, so the wait needs its own way out
  const startAgain = () => {
    setFailure(null)
    setScan(null)
    updateSession(session, { stage: undefined })
    recordAttempts(codeReplaced(attempts))
    req.retry()
  }

  // Started before consent, so the QR is ready the moment Continue is pressed
  const req = useRequest(
    { domain, request, query, session },
    {
      onCreated: (created, info) => {
        Promise.resolve()
          .then(() => onRequestCreated?.(created, info))
          .catch(failFrom)
      },
      onReceived: () => {
        setUnconfirmed(false)
        setScan({ stage: "scanned" })
        updateSession(session, { stage: "scanned" })
        send({ type: "request-received" })
      },
      onProving: () => {
        setUnconfirmed(false)
        setScan({ stage: "proving", done: 0, total: null })
        updateSession(session, { stage: "proving" })
        send({ type: "generating" })
      },
      onProof: (proof) => {
        setUnconfirmed(false)
        setScan((current) => withProof(current, proof))
        send({ type: "proof-generated", index: proof.index, total: proof.total, name: proof.name })
      },
      onSuccess: ({ proofs, result }) => {
        Promise.resolve()
          .then(() => send({ type: "success", proofs, result }))
          .then(() => setVerified(true), failFrom)
      },
      onReject: () => {
        failWith({
          title: "Request declined",
          message: "You declined the request in ZKPassport. Start again if that was a mistake.",
          retryLabel: "Start again",
          explained: true,
        })
        send({ type: "rejected" })
      },
      onError: (message) => {
        const known = describePhoneError(String(message), appName)
        failWith(
          known
            ? { title: known.title, message: known.message, explained: true }
            : {
                title: "Verification didn’t finish",
                message: "Something went wrong on your phone. Try again.",
                detail: String(message),
              },
        )
        send({ type: "error", message: String(message), code: known?.code })
      },
      onConnectionLost: () => {
        failWith({
          title: "Lost touch with your phone",
          message: "Check your phone is online, then reconnect.",
          keepsBridge: true,
        })
      },
    },
  )

  useEffect(() => {
    if (req.url) recordAttempts(codeShown(attempts))
  }, [req.url])

  // From the moment the request is live: closing drops the bridge, and once the
  // phone has joined it also throws away work in progress
  useConfirmClose(!verified && !failure)

  const link = useRequestUrl(req.url, request, attempts.stalledAttempts)
  const appClip = useContinueToAppClip(link.url, () => setConsented(true))

  const screen = (() => {
    if (verified) return "done"
    if (failure) return "error"
    if (scan) return "waiting"
    return consented ? "scan" : "intro"
  })()

  // Only a dropped connection leaves anything worth keeping. Starting over after a decline would
  // replay the decline itself.
  const tryAgain = () => {
    const keepsBridge = failure?.keepsBridge
    const explained = failure?.explained
    setFailure(null)
    if (keepsBridge) return req.resume()
    recordAttempts(codeReplaced(attempts, explained))
    req.retry()
  }

  return (
    <FlowCard name={appName} logo={logo} screenKey={screen}>
      {screen === "done" ? <Done outcome={{ kind: "verified" }} appName={appName} /> : null}
      {screen === "error" && failure ? (
        <ErrorScreen
          title={failure.title}
          message={failure.message}
          detail={failure.detail}
          onRetry={tryAgain}
          retryLabel={failure.keepsBridge ? "Reconnect" : failure.retryLabel}
          onStartOver={failure.keepsBridge ? startAgain : undefined}
        />
      ) : null}
      {screen === "waiting" && scan ? (
        <Waiting
          progress={scan}
          onStartAgain={startAgain}
          unconfirmed={unconfirmed}
          requestUrl={link.url}
        />
      ) : null}
      {screen === "scan" ? (
        <Scan
          state={req.state}
          url={link.url}
          qrSvg={link.qrSvg}
          onNewCode={startAgain}
          appClipOpened={appClip.appClipOpened}
        />
      ) : null}
      {screen === "intro" ? (
        <Intro
          appName={appName}
          query={req.query ?? (hasQuery ? query : null)}
          purpose={request.purpose}
          onContinue={appClip.onContinue}
        />
      ) : null}
    </FlowCard>
  )
}

function progressSoFar(session: Session): ScanProgress | null {
  const stage = readSession(session)?.stage
  if (!stage) return null
  return stage === "proving" ? { stage, done: 0, total: null } : { stage }
}
