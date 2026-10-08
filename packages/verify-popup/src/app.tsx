import { useEffect, useMemo, useRef, useState } from "react"
import { isPopupMessage } from "@zkpassport/sdk/popup"
import { isInAppBrowser } from "@zkpassport/ui/hosted"

import type { PopupEventMessage } from "@zkpassport/sdk/popup"
import { CredentialFlow } from "./mint"
import { VerifyFlow } from "./verify"
import { Done } from "./shared/done"
import { FlowCard } from "./shared/flow-card"
import { Frame, Notice } from "./shared/frame"
import { LinkActions } from "./shared/link-actions"
import { LinkVerification } from "./link"
import { openSession, readSession, updateSession, type SessionConfiguration } from "./session"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

// The transport adds the zkpassport marker, so it is omitted here
export type OutgoingEvent = DistributiveOmit<PopupEventMessage, "zkpassport">

// The session goes out with every message: a tab the browser discarded comes back as a different
// window, and the page waiting for the result has no other way to recognise it
function post(message: OutgoingEvent, session: string, rpOrigin: string, target: Window | null) {
  target?.postMessage({ zkpassport: true, session, ...message }, rpOrigin)
}

export function App() {
  const linkId = useMemo(() => new URLSearchParams(window.location.search).get("vl"), [])
  // The link flow answers to the dashboard rather than to an opener, so it needs no session
  const session = useMemo(() => (linkId ? null : openSession()), [linkId])
  const restored = useMemo(() => (session ? readSession(session) : null), [session])
  const [config, setConfig] = useState<SessionConfiguration | null>(
    () => restored?.configuration ?? null,
  )
  // Only a result this page found waiting for it; one produced while it runs belongs to the flow
  const alreadyDone = restored?.result ?? null
  // A discarded tab loses window.opener, and a reloaded opener loses its handle on us, so replies
  // go to whichever window last got in touch
  const replyTo = useRef<Window | null>(null)

  useEffect(() => {
    if (!session) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data
      if (!isPopupMessage(data) || data.type !== "configure") return
      if (data.session && data.session !== session.id) return
      const known = readSession(session)
      // Once an origin has been attested for a verification, only that origin may drive it
      if (known?.configuration && known.configuration.rpOrigin !== event.origin) return
      if (event.source) replyTo.current = event.source as Window
      const configuration = known?.configuration ?? {
        request: data.request,
        query: data.query,
        credential: data.credential,
        rpOrigin: event.origin,
      }
      if (!known?.configuration) updateSession(session, { configuration })
      setConfig((current) => current ?? configuration)
      // A result produced while the asking page was gone is still waiting to be handed over
      if (known?.result) post(known.result, session.id, configuration.rpOrigin, replyTo.current)
    }
    window.addEventListener("message", onMessage)
    // Announce readiness; carries no data, so a wildcard target is safe
    ;(window.opener as Window | null)?.postMessage(
      { zkpassport: true, type: "ready", session: session.id },
      "*",
    )
    return () => window.removeEventListener("message", onMessage)
  }, [session])

  const send = useMemo(() => {
    if (!config || !session) return null
    return (message: OutgoingEvent) => {
      // Held before it is sent, so a page that was not there to receive it can still be given it
      if (message.type === "success") updateSession(session, { result: message })
      post(
        message,
        session.id,
        config.rpOrigin,
        replyTo.current ?? (window.opener as Window | null),
      )
    }
  }, [config, session])

  if (linkId) {
    return (
      <Frame>
        <LinkVerification linkId={linkId} />
      </Frame>
    )
  }

  if (!config && !window.opener) {
    // In an in-app browser the user did press the button, so point them to a real browser rather
    // than tell them they opened the page by mistake
    return <Frame>{isInAppBrowser() ? <InAppBrowserNotice /> : <OpenedDirectlyNotice />}</Frame>
  }

  if (!session || !config || !send) {
    return (
      <Frame>
        <Notice>Connecting…</Notice>
      </Frame>
    )
  }

  const domain = new URL(config.rpOrigin).hostname
  const appName = config.request.name || domain

  // The proving happened before this page was rebuilt, so all that is left is to hand it over
  if (alreadyDone) {
    return (
      <Frame>
        <FlowCard name={appName} logo={config.request.logo} screenKey="done">
          <Done outcome={{ kind: "verified" }} appName={appName} />
        </FlowCard>
      </Frame>
    )
  }

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
      <VerifyFlow
        request={config.request}
        query={config.query}
        rpHost={domain}
        session={session}
        send={send}
      />
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
