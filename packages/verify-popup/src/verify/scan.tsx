import { useEffect, useRef, useState } from "react"
import { openRequestInApp } from "@zkpassport/ui/app-link"
import { isInAppBrowser, isMobileLike } from "@zkpassport/ui/hosted"

import { ICON_ZKP_MARK } from "../shared/icons"
import { Heading, Main } from "../shared/controls"
import { LinkActions } from "../shared/link-actions"
import { StoreBadges } from "../shared/store-badges"
import type { RequestState } from "../request"

export function Scan({
  state,
  url,
  qrSvg,
}: {
  state: RequestState
  url: string | null
  qrSvg: string | null
}) {
  const [qrRevealed, setQrRevealed] = useState(false)
  const [mobile] = useState(isMobileLike)

  if (mobile && !qrRevealed) {
    return <ContinueInApp requestUrl={url} onRevealQr={() => setQrRevealed(true)} />
  }

  return (
    <div className="flow-body">
      <Main>
        <Heading title="Continue on your phone" />
        <p className="flow-lede">
          Scan this code with your phone&rsquo;s camera to continue. Your ID is read on your phone
          and never sent to a server.
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
        <Fallback url={url} />
      </Main>
    </div>
  )
}

function ContinueInApp({
  requestUrl,
  onRevealQr,
}: {
  requestUrl: string | null
  onRevealQr: () => void
}) {
  const [inAppBrowser] = useState(isInAppBrowser)
  const [appDidNotOpen, setAppDidNotOpen] = useState(false)

  return (
    <div className="flow-body">
      <Main>
        <Heading title="Continue in the app" />
        <p className="flow-lede">
          Open the ZKPassport app to scan your ID. Your ID is read on your phone and never sent to a
          server.
        </p>
        <div className="scan-hero">
          {requestUrl ? (
            <OpenAppButton
              requestUrl={requestUrl}
              // An in-app browser swallows the custom scheme even when the app is installed, so a
              // probe there would always report a miss
              onOpened={inAppBrowser ? undefined : (opened) => setAppDidNotOpen(!opened)}
            />
          ) : (
            <span className="flow-primary" aria-disabled="true">
              Preparing…
            </span>
          )}
          {inAppBrowser && requestUrl ? (
            <div className="scan-escape">
              <p className="scan-fallback-hint">
                This app&rsquo;s built-in browser can&rsquo;t reach ZKPassport. Open this link in
                Safari or Chrome instead.
              </p>
              <LinkActions url={requestUrl} />
            </div>
          ) : null}
          <button type="button" className="scan-reveal" onClick={onRevealQr}>
            Scan a QR code with another device instead
          </button>
          <InstallOptions requestUrl={requestUrl} promoted={appDidNotOpen} />
        </div>
      </Main>
    </div>
  )
}

function OpenAppButton({
  requestUrl,
  onOpened,
}: {
  requestUrl: string
  onOpened?: (opened: boolean) => void
}) {
  const stopProbe = useRef<(() => void) | null>(null)
  useEffect(() => () => stopProbe.current?.(), [])

  const openApp = () => {
    stopProbe.current?.()
    stopProbe.current = openRequestInApp(requestUrl, onOpened)
  }

  return (
    <button type="button" className="flow-primary" onClick={openApp}>
      Open ZKPassport App
    </button>
  )
}

// Always on screen, so a probe that wrongly concludes the app is missing costs the user nothing
function InstallOptions({
  requestUrl,
  promoted,
}: {
  requestUrl: string | null
  promoted: boolean
}) {
  return (
    <div className="scan-install" data-promoted={promoted ? "" : undefined}>
      <p className="scan-install-title">Don&rsquo;t have the app yet?</p>
      <p className="scan-install-note">
        Verification happens in the ZKPassport app: it reads the chip in your passport or ID card,
        and that data never leaves your phone. Free on iOS and Android.
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
