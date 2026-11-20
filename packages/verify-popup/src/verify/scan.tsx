import { useState } from "react"
import { isInAppBrowser, isMobileLike } from "@zkpassport/ui/hosted"

import { ICON_ZKP_MARK } from "../shared/icons"
import { Heading, Main, Primary } from "../shared/controls"
import { LinkActions } from "../shared/link-actions"
import { StoreBadges } from "../shared/store-badges"
import { useOpenApp } from "../shared/use-open-app"
import type { RequestState } from "../request"

export function Scan({
  state,
  url,
  qrSvg,
  onNewCode,
  appClipOpened,
}: {
  state: RequestState
  url: string | null
  qrSvg: string | null
  onNewCode?: () => void
  appClipOpened?: boolean
}) {
  const [qrRevealed, setQrRevealed] = useState(false)
  const [mobile] = useState(isMobileLike)

  if (mobile && !qrRevealed) {
    return (
      <ContinueInApp
        key={url ?? "preparing"}
        requestUrl={url}
        appClipOpened={appClipOpened}
        onRevealQr={() => setQrRevealed(true)}
        onStartAgain={onNewCode}
      />
    )
  }

  return (
    <div className="flow-body">
      <Main>
        <Heading title={mobile ? "Scan from another device" : "Continue on your phone"} />
        <p className="flow-lede">
          {mobile
            ? "Open the camera on another phone and scan this code. Your ID is read on that phone, not this one."
            : "Scan this code with your phone’s camera to continue."}
        </p>
        <div className="scan-slot" data-state={state}>
          <div className="scan-skeleton" />
          <div
            className="scan-qr"
            dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined}
          />
          {qrSvg ? (
            <div className="scan-mark" dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }} />
          ) : null}
        </div>
        {mobile ? (
          <button type="button" className="scan-reveal" onClick={() => setQrRevealed(false)}>
            Open the ZKPassport app instead
          </button>
        ) : null}
        <Fallback url={url} />
        {url && onNewCode ? (
          <button type="button" className="scan-reveal" onClick={onNewCode}>
            Having trouble? Get a new code
          </button>
        ) : null}
      </Main>
    </div>
  )
}

function ContinueInApp({
  requestUrl,
  appClipOpened,
  onRevealQr,
  onStartAgain,
}: {
  requestUrl: string | null
  appClipOpened?: boolean
  onRevealQr: () => void
  onStartAgain?: () => void
}) {
  const [inAppBrowser] = useState(isInAppBrowser)
  // An in-app browser swallows the custom scheme even when the app is installed, so a probe there
  // would always report a miss
  const { openState, openApp } = useOpenApp(requestUrl, {
    probe: !inAppBrowser,
    opened: appClipOpened,
  })
  const opening = openState === "opening"
  const handedOff = openState === "opened"

  return (
    <div className="flow-body">
      <Main>
        <Heading title={handedOff ? "Check your phone" : "Continue in the app"} />
        <p className="flow-lede">
          {handedOff
            ? "Approve the request in the ZKPassport app. This page carries on by itself."
            : "Open the ZKPassport app to scan your ID. Your ID is read on your phone and never sent to a server."}
        </p>
        <div className="scan-hero" data-state={openState}>
          {handedOff ? (
            <>
              <button type="button" className="scan-reveal" onClick={openApp}>
                Open the app again
              </button>
              {onStartAgain ? (
                <button type="button" className="scan-reveal" onClick={onStartAgain}>
                  Having trouble? Start again
                </button>
              ) : null}
            </>
          ) : requestUrl ? (
            <Primary busy={opening} onClick={openApp}>
              {opening ? "Opening…" : "Open ZKPassport App"}
            </Primary>
          ) : (
            <span className="flow-primary" aria-disabled="true">
              Preparing…
            </span>
          )}
          {inAppBrowser && requestUrl ? (
            <div className="scan-escape">
              <p className="scan-fallback-hint">
                This app&rsquo;s built-in browser can&rsquo;t reach ZKPassport. Open this link in
                your browser instead.
              </p>
              <LinkActions url={requestUrl} />
            </div>
          ) : null}
          {handedOff ? null : (
            <InstallOptions requestUrl={requestUrl} appNotFound={openState === "nothing-opened"} />
          )}
          <button type="button" className="scan-reveal" onClick={onRevealQr}>
            Scan a QR code with another device instead
          </button>
        </div>
      </Main>
    </div>
  )
}

// Always on screen, so a probe that wrongly concludes the app is missing costs the user nothing
function InstallOptions({
  requestUrl,
  appNotFound,
}: {
  requestUrl: string | null
  appNotFound: boolean
}) {
  return (
    <div className="scan-install">
      <p className="scan-install-title" role={appNotFound ? "status" : undefined}>
        {appNotFound ? "App not found" : "Don’t have the app yet?"}
      </p>
      <p className="scan-install-note">
        {appNotFound
          ? "Install the ZKPassport app, then tap Open again. It reads the chip in your passport or ID card, and that data never leaves your phone."
          : "Verification happens in the ZKPassport app: it reads the chip in your passport or ID card, and that data never leaves your phone. Free on iOS and Android."}
      </p>
      <StoreBadges requestUrl={requestUrl} />
    </div>
  )
}

function Fallback({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)

  if (!url) return null

  return (
    <div className="scan-fallback">
      <p className="scan-fallback-label">Can&rsquo;t scan the code?</p>
      <LinkActions url={url} onCopyFailedChange={setFailed} />
      <p className="scan-fallback-hint" role={failed ? "alert" : undefined}>
        {failed
          ? "Couldn’t reach the clipboard. Select the QR code and use your browser’s share menu."
          : "Send the link to your phone and open it there."}
      </p>
    </div>
  )
}
