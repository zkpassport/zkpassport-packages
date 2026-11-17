import { useState } from "react"
import { isInAppBrowser } from "@zkpassport/ui/hosted"

import { useFlowPage } from "../shared/flow-card"
import { Frame } from "../shared/frame"
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
  const request = parseVerifyRequest(window.location.search)
  const requestUrl = request ? window.location.href : null
  const siteName = request?.serviceName || request?.domain || null
  useFlowPage()

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
                      ? `Get ZKPassport to verify for ${siteName}`
                      : "Get ZKPassport to verify your identity"}
                  </h1>
                </div>
                {/* Why an app at all, in one sentence: it is what keeps the ID off any server */}
                <p className="flow-lede">
                  The free app reads the chip in your passport or ID card and proves it on your
                  phone, so your ID is never uploaded.
                </p>
                <div className="r-install">
                  <StoreBadges requestUrl={requestUrl} />
                  {requestUrl ? (
                    <p className="r-note">Then open the app. Your request will be waiting.</p>
                  ) : null}
                </div>
                {requestUrl ? <OpenAppPrompt requestUrl={requestUrl} /> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  )
}

function OpenAppPrompt({ requestUrl }: { requestUrl: string }) {
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
          I already have the app
        </button>
      </div>
    )
  }

  // Installing is the likely path here, so opening the app stays a quiet second choice
  return (
    <div className="r-actions">
      {openState === "nothing-opened" ? (
        <p className="r-note" role="status">
          ZKPassport isn&rsquo;t on this phone yet. Get it above.
        </p>
      ) : null}
      <button type="button" className="scan-reveal" disabled={opening} onClick={openApp}>
        {opening ? "Opening…" : "I already have the app"}
      </button>
    </div>
  )
}
