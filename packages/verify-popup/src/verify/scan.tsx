import { useState } from "react"
import { isInAppBrowser, isMobileLike } from "@zkpassport/ui/hosted"

import { ICON_ZKP_MARK } from "../shared/icons"
import { Heading, LockLine, Main, Primary } from "../shared/controls"
import { CopyLink, LinkActions } from "../shared/link-actions"
import { StoreBadges } from "../shared/store-badges"
import { useOpenApp } from "../shared/use-open-app"
import type { RequestState } from "../request"
import { isAppClipLane } from "./lane"

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
        <Heading title={mobile ? "Scan from another phone" : "Scan with your phone"} />
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
        <div className="scan-foot">
          <LockLine>Your ID is read on your phone, never uploaded</LockLine>
          {url ? <CopyLink url={url} /> : null}
          {mobile ? (
            <button type="button" className="scan-reveal" onClick={() => setQrRevealed(false)}>
              Open ZKPassport on this phone instead
            </button>
          ) : null}
          {url && onNewCode ? (
            <button type="button" className="scan-reveal" onClick={onNewCode}>
              Having trouble? Get a new code
            </button>
          ) : null}
        </div>
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
  const appNotFound = openState === "nothing-opened"
  // The App Clip link opens ZKPassport on an iPhone without installing first. Whether the clip can
  // read this ID is only known once it has the ID, so nothing here promises it can
  const appClip = isAppClipLane(requestUrl)

  const title = handedOff
    ? "Check your phone"
    : appNotFound
      ? "Get the ZKPassport app"
      : appClip
        ? "Continue on this phone"
        : "Continue in ZKPassport"

  return (
    <div className="flow-body">
      <Main>
        <Heading title={title} lock={handedOff ? undefined : "Your ID never leaves your phone"} />
        {handedOff ? (
          <p className="flow-lede">
            Slide to approve in ZKPassport. This page carries on by itself.
          </p>
        ) : null}
        {appNotFound ? (
          <p className="flow-lede">
            It isn&rsquo;t installed on this phone yet. Install it, then open it: your request will
            be waiting.
          </p>
        ) : null}
        <div className="scan-hero" data-state={openState}>
          {handedOff ? (
            <>
              <button type="button" className="scan-reveal" onClick={openApp}>
                Open ZKPassport again
              </button>
              {onStartAgain ? (
                <button type="button" className="scan-reveal" onClick={onStartAgain}>
                  Having trouble? Start again
                </button>
              ) : null}
            </>
          ) : requestUrl ? (
            <Primary busy={opening} onClick={openApp}>
              {opening
                ? "Opening…"
                : appNotFound
                  ? "Try opening again"
                  : appClip
                    ? "Continue"
                    : "Open ZKPassport"}
            </Primary>
          ) : (
            <span className="flow-primary" aria-disabled="true">
              Preparing…
            </span>
          )}
          {appClip && !handedOff && !appNotFound ? (
            <p className="scan-sub">
              Opens ZKPassport right away, usually with nothing to install.
            </p>
          ) : null}
          {inAppBrowser && requestUrl ? (
            <div className="scan-escape">
              <p className="scan-sub">
                This app&rsquo;s built-in browser can&rsquo;t reach ZKPassport. Open this link in
                your browser instead.
              </p>
              <LinkActions url={requestUrl} />
            </div>
          ) : null}
          {/* Always on screen for the full app, so a probe that wrongly concludes it is missing
              costs the user nothing */}
          {handedOff || (appClip && !appNotFound) ? null : (
            <div className="scan-install" role={appNotFound ? "status" : undefined}>
              {appNotFound ? null : <p className="scan-sub">Don&rsquo;t have the app yet?</p>}
              <StoreBadges requestUrl={requestUrl} />
            </div>
          )}
          <button type="button" className="scan-reveal" onClick={onRevealQr}>
            Use another device instead
          </button>
        </div>
      </Main>
    </div>
  )
}
