import { useEffect, useState } from "react"
import { CLOSE_ON_RETURN_HASH } from "@zkpassport/ui/app-link"
import { isInAppBrowser } from "@zkpassport/ui/hosted"

import { Frame } from "../shared/frame"
import { Primary } from "../shared/controls"
import { ZKPASSPORT_WORDMARK } from "../shared/icons"
import { LinkActions } from "../shared/link-actions"
import { StoreBadges } from "../shared/store-badges"
import { useOpenApp } from "../shared/use-open-app"
import { parseVerifyRequest } from "./request-link"
import "../main.css"

/**
 * Where a request link lands when the app did not take it. The OS hands the link straight to the
 * installed app, so whoever sees this page almost certainly has to install it first.
 */
export function RequestPage() {
  useCloseOnReturn()
  const request = parseVerifyRequest(window.location.search)
  const requestUrl = request ? window.location.href : null
  const siteName = request?.serviceName || request?.domain || null

  return (
    <Frame>
      <div className="flow-card">
        <p className="r-mark" dangerouslySetInnerHTML={{ __html: ZKPASSPORT_WORDMARK }} />
        <div className="flow-stage">
          <div className="flow-step">
            <div className="flow-body">
              <div className="flow-main">
                <div className="flow-heading">
                  <h1 className="flow-title">
                    {siteName
                      ? `${siteName} uses ZKPassport to verify your identity`
                      : "Verify your identity privately with ZKPassport"}
                  </h1>
                </div>
                <p className="flow-lede">
                  {siteName ? "To continue, download" : "Download"} the free ZKPassport app. It
                  reads your passport or ID securely and verifies your identity. Your ID data never
                  leaves your phone, except the details you choose to share.
                </p>
                <StoreBadges requestUrl={requestUrl} />
                {requestUrl ? <OpenAppPrompt requestUrl={requestUrl} siteName={siteName} /> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  )
}

/**
 * A page that waits for the result opened this tab. When the user comes back from the app or the
 * App Clip, that page has the result, so this tab gets out of its way.
 */
function useCloseOnReturn() {
  useEffect(() => {
    if (window.location.hash !== CLOSE_ON_RETURN_HASH) return
    let leftThePage = false
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") leftThePage = true
      else if (leftThePage) window.close()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [])
}

function OpenAppPrompt({ requestUrl, siteName }: { requestUrl: string; siteName: string | null }) {
  const [inAppBrowser] = useState(isInAppBrowser)
  // A probe inside an in-app browser always misses, even when the app is installed
  const { openState, openApp } = useOpenApp(requestUrl, { probe: !inAppBrowser })
  const opening = openState === "opening"

  // Opening the app from here rarely works, so the way out leads and the attempt stays available
  if (inAppBrowser) {
    return (
      <div className="r-actions">
        <p className="r-note">
          This app&rsquo;s built-in browser can&rsquo;t reach ZKPassport. Open this link in your
          browser instead.
        </p>
        <LinkActions url={requestUrl} />
        <button type="button" className="scan-reveal" onClick={openApp}>
          Already installed? Open the app
        </button>
      </div>
    )
  }

  return (
    <div className="r-actions">
      <Primary busy={opening} onClick={openApp}>
        {opening ? "Opening…" : "Already installed? Open the app"}
      </Primary>
      {openState === "nothing-opened" ? (
        <p className="r-note" role="status">
          App not found. Install it above, then tap Open again.
        </p>
      ) : null}
      <p className="r-note">
        Once you finish in the app, go back to {siteName ?? "the site that asked"} in your browser
        to complete the request.
      </p>
    </div>
  )
}
