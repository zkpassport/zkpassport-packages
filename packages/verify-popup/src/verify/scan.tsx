import { useEffect, useRef, useState, type ReactNode } from "react"
import { copyRequestForInstall } from "@zkpassport/ui/app-link"
import { isInAppBrowser, isMobileLike } from "@zkpassport/ui/hosted"

import { ICON_ZKP_MARK } from "../shared/icons"
import { FootLinks, Heading, LockLine, Main, Primary } from "../shared/controls"
import { CopyLink, LinkActions } from "../shared/link-actions"
import { StoreBadges, storeUrlFor } from "../shared/store-badges"
import {
  canOpenAppClip,
  isOnAppClipPage,
  openAppClipPage,
  useOpenApp,
} from "../shared/use-open-app"
import type { RequestState } from "../request"
import { isAppClipLane } from "./lane"

export function Scan({
  state,
  url,
  qrSvg,
  onNewCode,
  appClipOpened,
  sessionId,
  asks,
}: {
  state: RequestState
  url: string | null
  qrSvg: string | null
  onNewCode?: () => void
  appClipOpened?: boolean
  sessionId?: string
  asks?: ReactNode
}) {
  const [qrRevealed, setQrRevealed] = useState(false)
  const [mobile] = useState(isMobileLike)

  if (mobile && !qrRevealed) {
    return (
      <ContinueInApp
        key={url ?? "preparing"}
        requestUrl={url}
        appClipOpened={appClipOpened}
        sessionId={sessionId}
        asks={asks}
        onRevealQr={() => setQrRevealed(true)}
        onStartAgain={onNewCode}
      />
    )
  }

  return (
    <div className="flow-body">
      <Main>
        <Heading
          title={mobile ? "Scan from another phone" : "Scan with your phone"}
          hint={mobile ? undefined : "Continue on your iPhone or Android phone"}
        />
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
          <LockLine>Your ID never leaves your phone</LockLine>
        </div>
      </Main>
      <FootLinks>
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
      </FootLinks>
    </div>
  )
}

function ContinueInApp({
  requestUrl,
  appClipOpened,
  sessionId,
  asks,
  onRevealQr,
  onStartAgain,
}: {
  requestUrl: string | null
  appClipOpened?: boolean
  sessionId?: string
  asks?: ReactNode
  onRevealQr: () => void
  onStartAgain?: () => void
}) {
  const [inAppBrowser] = useState(isInAppBrowser)
  // An in-app browser swallows the custom scheme even when the app is installed, so a probe there
  // would always report a miss
  const { openState, openApp } = useOpenApp(requestUrl, {
    probe: !inAppBrowser,
    opened: appClipOpened,
    sessionId,
  })
  const opening = openState === "opening"
  const handedOff = openState === "opened"
  const appNotFound = openState === "nothing-opened"
  // Where no App Clip can open, Continue leads to a page about the app first, so a tap never
  // fires the app link at a phone that may not have the app
  const [onAppPage, setOnAppPage] = useState(false)
  // The App Clip link opens ZKPassport on an iPhone without installing first. Whether the clip can
  // read this ID is only known once it has the ID, so nothing here promises it can
  const appClip = isAppClipLane(requestUrl)
  // The page iOS shows the App Clip banner and card on, so it is the app page from the start
  const [onAppClipPage] = useState(isOnAppClipPage)
  // A tap on Open ZKPassport that finds no app goes on to the store, with the request copied
  // during the tap for the app to pick up after the install
  const storeOnMiss = useRef(false)
  useEffect(() => {
    if (!appNotFound || !storeOnMiss.current) return
    storeOnMiss.current = false
    const storeUrl = storeUrlFor(requestUrl)
    if (storeUrl) window.location.assign(storeUrl)
  }, [appNotFound, requestUrl])
  const openOrInstall = () => {
    copyRequestForInstall(requestUrl)
    storeOnMiss.current = true
    openApp()
  }

  const anotherPhone = (
    <button type="button" className="scan-reveal" onClick={onRevealQr}>
      Use another phone instead
    </button>
  )
  const escape =
    inAppBrowser && requestUrl ? (
      <div className="scan-escape">
        <p className="scan-sub">
          This app&rsquo;s built-in browser can&rsquo;t reach ZKPassport. Open this link in your
          browser instead.
        </p>
        <LinkActions url={requestUrl} />
      </div>
    ) : null

  if (handedOff) {
    return (
      <div className="flow-body">
        <Main>
          <Heading title="Approve in ZKPassport" />
          <p className="flow-lede">Slide to verify in the app. This page carries on by itself.</p>
          {/* Still offered once the app seems to have opened, so a probe that wrongly concludes it
              did costs the user nothing */}
          {appClip ? null : (
            <div className="scan-hero">
              <div className="scan-install">
                <p className="scan-sub">Don&rsquo;t have the app yet?</p>
                <StoreBadges requestUrl={requestUrl} />
              </div>
            </div>
          )}
        </Main>
        <FootLinks>
          <button type="button" className="scan-reveal" onClick={openApp}>
            Open ZKPassport again
          </button>
          {onStartAgain ? (
            <button type="button" className="scan-reveal" onClick={onStartAgain}>
              Having trouble? Start again
            </button>
          ) : null}
          {anotherPhone}
        </FootLinks>
      </div>
    )
  }

  if (onAppClipPage || onAppPage || appNotFound) {
    const clipPrompt = onAppClipPage && !appNotFound
    return (
      <div className="flow-body">
        <Main>
          <Heading title="Verify with the ZKPassport app" lock="Your ID never leaves your phone" />
          <div className="scan-store" role={appNotFound ? "status" : undefined}>
            <p className="flow-lede">
              {appNotFound ? (
                "ZKPassport isn’t on this phone yet. Get it, then open it here."
              ) : clipPrompt ? (
                <>
                  Tap <strong>Open</strong> in the banner above, or <strong>Open App Clip</strong>{" "}
                  on the card.
                </>
              ) : (
                "Get the free app to continue."
              )}
            </p>
            {clipPrompt ? <p className="scan-sub">No banner? Get the ZKPassport app.</p> : null}
            <StoreBadges requestUrl={requestUrl} />
          </div>
          <div className="scan-hero">
            {clipPrompt && requestUrl ? (
              <button
                type="button"
                className="scan-reveal"
                onClick={() => openAppClipPage(requestUrl)}
              >
                Show the banner again
              </button>
            ) : null}
            {anotherPhone}
            <p className="scan-sub">Already have the app?</p>
            <Primary busy={opening} forward onClick={openOrInstall}>
              {opening ? "Opening…" : "Open ZKPassport"}
            </Primary>
            {escape}
          </div>
        </Main>
      </div>
    )
  }

  const onContinue = () => {
    if (requestUrl && canOpenAppClip(requestUrl)) openApp()
    else setOnAppPage(true)
  }

  return (
    <div className="flow-body">
      <Main>
        <Heading
          title={asks ? "Verify your identity privately" : "Continue on this phone"}
          lock="Your ID never leaves your phone"
        />
        {asks}
        <div className="scan-hero">
          {anotherPhone}
          {requestUrl ? (
            <Primary busy={opening} forward onClick={onContinue}>
              {opening ? "Opening…" : "Continue"}
            </Primary>
          ) : (
            <span className="flow-primary" aria-disabled="true">
              Preparing…
            </span>
          )}
          {escape}
        </div>
      </Main>
    </div>
  )
}
