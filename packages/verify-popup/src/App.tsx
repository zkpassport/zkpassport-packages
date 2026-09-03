import { useEffect, useMemo, useRef, useState } from "react"
import {
  hydrateQueryBuilder,
  isPopupMessage,
  type PopupConfigureMessage,
  type PopupEventMessage,
} from "@zkpassport/sdk/popup"
import { ZKPassportQRCode } from "@zkpassport/ui/hosted"

import { AttestFlow } from "./AttestFlow"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type OutgoingEvent = DistributiveOmit<PopupEventMessage, "zkpassport">

type Configuration = {
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  // Browser-attested origin of the relying party page that opened this popup.
  rpOrigin: string
}

export function App() {
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

  if (standalone) {
    return (
      <Frame>
        <p style={styles.notice}>
          This page verifies your ID for websites that use ZKPassport. Open it from a website's
          "Verify with ZKPassport" button.
        </p>
      </Frame>
    )
  }

  if (!config || !send) {
    return (
      <Frame>
        <p style={styles.notice}>Connecting…</p>
      </Frame>
    )
  }

  const domain = new URL(config.rpOrigin).hostname
  const request = config.request

  // Auto-close once the flow is complete (after the outcome screen has shown)
  const scheduleClose = (delayMs: number) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => window.close(), delayMs)
  }

  if (request.attest) {
    return (
      <Frame>
        <AttestFlow request={request} attest={request.attest} send={send} />
      </Frame>
    )
  }

  return (
    <Frame>
      <ZKPassportQRCode
        domain={domain}
        name={request.name ?? domain}
        logo={request.logo}
        purpose={request.purpose}
        scope={request.scope}
        mode={request.mode}
        devMode={request.devMode}
        validity={request.validity}
        uniqueIdentifierType={request.uniqueIdentifierType}
        oprfKeyId={request.oprfKeyId}
        showIntroScreen
        query={(builder) => hydrateQueryBuilder(builder, config.query)}
        onRequestReceived={() => send({ type: "request-received" })}
        onGeneratingProof={() => send({ type: "generating" })}
        onProofGenerated={(proof) =>
          send({
            type: "proof-generated",
            index: proof.index,
            total: proof.total,
            name: proof.name,
          })
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

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={styles.frame}>{children}</div>
}

const styles: Record<string, React.CSSProperties> = {
  frame: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    padding: "16px 12px 24px",
    boxSizing: "border-box",
  },
  notice: {
    maxWidth: 320,
    marginTop: 80,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 1.5,
    color: "#6b7280",
  },
  hint: {
    maxWidth: 340,
    margin: 0,
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 1.5,
    color: "#9ca3af",
  },
}
