import { Frame } from "../shared/frame"
import { Primary } from "../shared/controls"
import { ZKPASSPORT_WORDMARK } from "../shared/icons"
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
  const siteName = request ? (request.serviceName ?? request.domain) : null

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
                      : "Prove your data privately with ZKPassport"}
                  </h1>
                </div>
                <p className="flow-lede">
                  {siteName ? "To continue, download" : "Download"} the ZKPassport app — free on iOS
                  and Android. Your passport or ID card is read on your phone, and its data never
                  leaves your device.
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

function OpenAppPrompt({ requestUrl, siteName }: { requestUrl: string; siteName: string | null }) {
  const { openState, openApp } = useOpenApp(requestUrl, { probe: true })
  const opening = openState === "opening"

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
