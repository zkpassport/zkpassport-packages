import { useEffect, useMemo, useState } from "react"
import { isPopupMessage, type PopupConfigureMessage } from "@zkpassport/sdk/popup"
import { isInAppBrowser } from "@zkpassport/ui/hosted"

import type { PopupEventMessage } from "@zkpassport/sdk/popup"
import { CredentialFlow } from "./mint"
import { VerifyFlow } from "./verify"
import { Frame, Notice } from "./shared/frame"
import { LinkActions } from "./shared/link-actions"
import { LinkVerification } from "./link"

type Configuration = {
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  credential: PopupConfigureMessage["credential"]
  // Browser-attested origin of the page that opened this popup
  rpOrigin: string
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

// The transport adds the zkpassport marker, so it is omitted here
export type OutgoingEvent = DistributiveOmit<PopupEventMessage, "zkpassport">

export function App() {
  const linkId = new URLSearchParams(window.location.search).get("vl")
  const [config, setConfig] = useState<Configuration | null>(null)
  const [standalone, setStandalone] = useState(false)

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
              credential: data.credential,
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
    // In an in-app browser the user did press the button, so point them to a real browser rather
    // than tell them they opened the page by mistake
    return <Frame>{isInAppBrowser() ? <InAppBrowserNotice /> : <OpenedDirectlyNotice />}</Frame>
  }

  if (!config || !send) {
    return (
      <Frame>
        <Notice>Connecting…</Notice>
      </Frame>
    )
  }

  const domain = new URL(config.rpOrigin).hostname

  if (config.credential) {
    return (
      <Frame>
        <CredentialFlow
          request={config.request}
          credential={config.credential}
          rpHost={domain}
          send={send}
        />
      </Frame>
    )
  }

  return (
    <Frame>
      <VerifyFlow request={config.request} query={config.query} rpHost={domain} send={send} />
    </Frame>
  )
}

function OpenedDirectlyNotice() {
  return (
    <Notice>
      This page verifies your ID for websites that use ZKPassport. Open it from a website's "Verify
      with ZKPassport" button.
    </Notice>
  )
}

function InAppBrowserNotice() {
  const site = referringSite()
  return (
    <>
      <Notice>
        You&rsquo;re in an app&rsquo;s built-in browser, which can&rsquo;t complete verification.
        Open {site ? site.host : "the site that sent you here"} in your browser and start again.
      </Notice>
      {site ? <LinkActions url={site.url} /> : null}
    </>
  )
}

function referringSite(): { url: string; host: string } | null {
  try {
    const referrer = new URL(document.referrer)
    return { url: referrer.href, host: referrer.hostname }
  } catch {
    return null
  }
}
