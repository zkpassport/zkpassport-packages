import { useEffect, useRef, useState } from "react"
import { openRequestInApp } from "@zkpassport/ui/app-link"

import { Frame } from "../shared/frame"
import { ZKPASSPORT_WORDMARK } from "../shared/icons"
import { StoreBadges } from "../shared/store-badges"
import { parseVerifyRequest } from "./request-link"
import "../main.css"

/**
 * Where a request link lands when the app did not take it. The OS hands the link straight to the
 * installed app, so whoever sees this page almost certainly has to install it first.
 */
export function RequestPage() {
  const requestUrl = window.location.href
  const request = parseVerifyRequest(window.location.search)
  const appName = request ? (request.serviceName ?? request.domain) : null

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
                    {appName
                      ? `${appName} uses ZKPassport to verify your identity`
                      : "Prove your data privately with ZKPassport"}
                  </h1>
                </div>
                <p className="flow-lede">
                  {appName ? "To continue, download" : "Download"} the ZKPassport app — free on iOS
                  and Android. Your passport or ID card is read on your phone, and its data never
                  leaves your device.
                </p>
                <StoreBadges requestUrl={request ? requestUrl : null} />
                {request ? <OpenAppPrompt requestUrl={requestUrl} appName={appName} /> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  )
}

function OpenAppPrompt({ requestUrl, appName }: { requestUrl: string; appName: string | null }) {
  const [appDidNotOpen, setAppDidNotOpen] = useState(false)
  const stopProbe = useRef<(() => void) | null>(null)
  useEffect(() => () => stopProbe.current?.(), [])

  const openApp = () => {
    stopProbe.current?.()
    stopProbe.current = openRequestInApp(requestUrl, (opened) => setAppDidNotOpen(!opened))
  }

  return (
    <div className="r-actions">
      <button type="button" className="flow-quietbtn" onClick={openApp}>
        Already installed? Open the app
      </button>
      {appDidNotOpen ? (
        <p className="r-note" role="status">
          Nothing opened. Install the app above, then come back here.
        </p>
      ) : null}
      <p className="r-note">
        Once you finish in the app, go back to {appName ?? "the site that asked"} in your browser to
        complete the request.
      </p>
    </div>
  )
}
