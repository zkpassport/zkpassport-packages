import { useState } from "react"
import type { PopupConfigureMessage } from "@zkpassport/sdk/popup"

import type { OutgoingEvent } from "../app"
import { FlowCard } from "../shared/flow-card"
import { Done } from "../shared/done"
import { useConfirmClose } from "../shared/use-confirm-close"
import { ErrorScreen } from "../shared/error"
import { useRequest } from "../request"
import { Intro } from "./intro"
import { Scan } from "./scan"
import { Waiting, withProof, type ScanProgress } from "./waiting"

type VerifyFlowProps = {
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  // Hostname of the relying party page; the header falls back to it when no name is sent
  rpHost: string
  send: (message: OutgoingEvent) => void
}

export function VerifyFlow({ request, query, rpHost, send }: VerifyFlowProps) {
  const [consented, setConsented] = useState(false)
  // A dashboard policy arrives as {}: the real checks come back from the SDK
  const hasQuery = Object.keys(query ?? {}).length > 0
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [verified, setVerified] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const appName = request.name || rpHost

  // Started before consent, so the QR is ready the moment Continue is pressed
  const req = useRequest(
    { domain: request.domain ?? rpHost, request, query },
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

  // A fresh request needs a fresh bridge, so retry restarts it rather than
  // just clearing the message
  const tryAgain = () => {
    setFailure(null)
    req.retry()
  }

  return (
    <FlowCard name={appName} logo={request.logo} screenKey={screen}>
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
