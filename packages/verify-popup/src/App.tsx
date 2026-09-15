import { useEffect, useMemo, useRef, useState } from "react"
import {
  isPopupMessage,
  type PopupConfigureMessage,
  type PopupEventMessage,
} from "@zkpassport/sdk/popup"

import { Frame, Notice } from "./layout"
import { LinkVerification } from "./link-verification"
import { VerificationCard } from "./verification-card"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type OutgoingEvent = DistributiveOmit<PopupEventMessage, "zkpassport">

type Configuration = {
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  // Browser-attested origin of the relying party page that opened this popup.
  rpOrigin: string
}

export function App() {
  const linkId = new URLSearchParams(window.location.search).get("vl")
  const [config, setConfig] = useState<Configuration | null>(null)
  const [standalone, setStandalone] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => {
    const opener = window.opener as Window | null
    if (!opener) {
      setStandalone(true)
      return
    }
    const onMessage = (event: MessageEvent) => {
      if (event.source !== opener) return
      const data = event.data
      if (!isPopupMessage(data) || data.type !== "configure") return
      setConfig((current) =>
        current
          ? current
          : {
              request: data.request,
              query: data.query,
              rpOrigin: event.origin,
            },
      )
    }
    window.addEventListener("message", onMessage)
    // Announce readiness; carries no data, so a wildcard target is safe
    opener.postMessage({ zkpassport: true, type: "ready" }, "*")
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const send = useMemo(() => {
    if (!config) return null
    return (message: OutgoingEvent) => {
      ;(window.opener as Window | null)?.postMessage(
        { zkpassport: true, ...message },
        config.rpOrigin,
      )
    }
  }, [config])

  if (linkId) {
    return (
      <Frame>
        <LinkVerification linkId={linkId} />
      </Frame>
    )
  }

  if (standalone) {
    return (
      <Frame>
        <Notice>
          This page verifies your ID for websites that use ZKPassport. Open it from a website's
          "Verify with ZKPassport" button.
        </Notice>
      </Frame>
    )
  }

  if (!config || !send) {
    return (
      <Frame>
        <Notice>Connecting…</Notice>
      </Frame>
    )
  }

  const domain = new URL(config.rpOrigin).hostname

  // Auto-close once the flow is complete (after the outcome screen has shown)
  const scheduleClose = (delayMs: number) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => window.close(), delayMs)
  }

  return (
    <Frame>
      <VerificationCard
        config={{ domain, request: config.request, query: config.query }}
        onRequestReceived={() => send({ type: "request-received" })}
        onGeneratingProof={() => send({ type: "generating" })}
        onProofGenerated={(proof) =>
          send({ type: "proof-generated", index: proof.index, total: proof.total, name: proof.name })
        }
        onSuccess={({ proofs, result }) => {
          send({ type: "success", proofs, result })
          // Close after showing the completion screen
          scheduleClose(2500)
        }}
        onReject={() => {
          send({ type: "rejected" })
          scheduleClose(1500)
        }}
        onError={(message) => send({ type: "error", message: String(message) })}
      />
    </Frame>
  )
}
