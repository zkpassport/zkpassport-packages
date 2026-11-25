import { useEffect, useState } from "react"
import { isInAppBrowser } from "@zkpassport/ui/hosted"

import { PoweredBy, useFlowPage } from "../shared/flow-card"
import { Frame } from "../shared/frame"
import { LinkActions } from "../shared/link-actions"
import { StoreBadges } from "../shared/store-badges"
import { CLOSE_ON_RETURN_HASH, canOpenAppClip, useOpenApp } from "../shared/use-open-app"
import { parseVerifyRequest } from "./request-link"
import "../main.css"

/**
 * Where a request link lands when the app did not take it. The OS hands the link straight to the
 * installed app, so whoever sees this page almost certainly has no app yet.
 */
export function RequestPage() {
  useCloseOnReturn()
  const request = parseVerifyRequest(window.location.search)
  const requestUrl = request ? window.location.href : null
  const siteName = request?.serviceName || request?.domain || null
  // In Safari, iOS offers the App Clip on this page through its own banner, which opens the full
  // app instead when it is installed. The full app's link would only show an error without the app.
  const [appClipBanner] = useState(() => requestUrl !== null && canOpenAppClip(requestUrl))
  useFlowPage()

  return (
    <Frame>
      <div className="flow-card">
        <div className="flow-stage">
          <div className="flow-step">
            <div className="flow-body">
              <div className="flow-main">
                <div className="flow-heading">
                  <h1 className="flow-title">
                    {appClipBanner
                      ? siteName
                        ? `${siteName} uses ZKPassport to verify your identity`
                        : "Verify your identity privately with ZKPassport"
                      : siteName
                        ? `Get ZKPassport to verify for ${siteName}`
                        : "Get ZKPassport to verify your identity"}
                  </h1>
                </div>
                {appClipBanner ? (
                  <>
                    <p className="flow-lede">
                      Tap Open in the ZKPassport banner at the top of this page. ZKPassport opens
                      right away, usually with nothing to install.
                    </p>
                    <div className="r-actions">
                      <p className="r-note">Prefer the full app?</p>
                      <StoreBadges requestUrl={requestUrl} />
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <PoweredBy />
      </div>
    </Frame>
  )
}

/**
 * The waiting page opened this tab. When the user comes back from the App Clip, the waiting page
 * has the result, so this tab gets out of its way.
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
