import { useEffect, useState } from "react"
import type { PopupConfigureMessage } from "@zkpassport/sdk/popup"

import type { OutgoingEvent } from "../app"
import { FlowCard } from "../shared/flow-card"
import { Done } from "../shared/done"
import { useConfirmClose } from "../shared/use-confirm-close"
import { ErrorScreen } from "../shared/error"
import { resolveTrustedDomain } from "../shared/trusted-domain"
import { useRequest } from "../request"
import type { Session } from "../session"
import { Intro } from "./intro"
import { Scan } from "./scan"
import { Waiting, withProof, type ScanProgress } from "./waiting"

type VerifyFlowProps = {
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  // Hostname of the relying party page; the header falls back to it when no name is sent
  rpHost: string
  session: Session
  send: (message: OutgoingEvent) => void
}

type DomainResolution = { domain: string } | { error: string } | null

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
        <ErrorScreen message={resolution.error} onRetry={() => setAttempt((n) => n + 1)} />
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

function VerifyRequest({
  domain,
  request,
  query,
  appName,
  logo,
  session,
  send,
}: {
  domain: string
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  appName: string
  logo?: string
  session: Session
  send: (message: OutgoingEvent) => void
}) {
  const [consented, setConsented] = useState(false)
  // A dashboard policy arrives as {}: the real checks come back from the SDK
  const hasQuery = Object.keys(query ?? {}).length > 0
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [verified, setVerified] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Started before consent, so the QR is ready the moment Continue is pressed
  const req = useRequest(
    { domain, request, query, session },
    {
      onReceived: () => {
        setScan({ stage: "scanned" })
        send({ type: "request-received" })
      },
      onProving: () => {
        setScan({ stage: "proving", done: 0, total: null })
        send({ type: "generating" })
      },
      onProof: (proof) => {
        setScan((current) => withProof(current, proof))
        send({ type: "proof-generated", index: proof.index, total: proof.total, name: proof.name })
      },
      onSuccess: ({ proofs, result }) => {
        setVerified(true)
        send({ type: "success", proofs, result })
      },
      onReject: () => {
        setScan(null)
        setFailure("The request was declined on your phone.")
        send({ type: "rejected" })
      },
      onError: (message) => {
        setScan(null)
        setFailure(String(message))
        send({ type: "error", message: String(message) })
      },
    },
  )

  // From the moment the request is live: closing drops the bridge, and once the
  // phone has joined it also throws away work in progress
  useConfirmClose(!verified && !failure)

  const screen = (() => {
    if (verified) return "done"
    if (failure) return "error"
    if (scan) return "waiting"
    return consented ? "scan" : "intro"
  })()

  // Keeps the bridge, so a proof the phone made while the connection was down is still delivered
  const tryAgain = () => {
    setFailure(null)
    req.resume()
  }

  return (
    <FlowCard name={appName} logo={logo} screenKey={screen}>
      {screen === "done" ? <Done outcome={{ kind: "verified" }} appName={appName} /> : null}
      {screen === "error" && failure ? <ErrorScreen message={failure} onRetry={tryAgain} /> : null}
      {screen === "waiting" && scan ? <Waiting progress={scan} /> : null}
      {screen === "scan" ? <Scan state={req.state} url={req.url} qrSvg={req.qrSvg} /> : null}
      {screen === "intro" ? (
        <Intro
          appName={appName}
          query={req.query ?? (hasQuery ? query : null)}
          purpose={request.purpose}
          onContinue={() => setConsented(true)}
        />
      ) : null}
    </FlowCard>
  )
}
