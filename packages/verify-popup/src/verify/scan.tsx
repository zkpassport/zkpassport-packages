import { useEffect, useState } from "react"

import { ICON_LINK, ICON_SHARE, ICON_ZKP_MARK } from "../shared/icons"
import { Heading, Main } from "../shared/controls"
import { isMobileLike } from "../shared/environment"
import type { RequestState } from "../request"

const COPIED_RESET_MS = 2000

export function Scan({
  state,
  url,
  qrSvg,
}: {
  state: RequestState
  url: string | null
  qrSvg: string | null
}) {
  // A phone cannot scan its own screen, so it gets the deep link instead and
  // keeps the QR behind a toggle for cross-device use
  const [qrRevealed, setQrRevealed] = useState(false)
  const [mobile] = useState(isMobileLike)

  if (mobile && !qrRevealed) {
    return (
      <div className="flow-body">
        <Main>
          <Heading title="Continue in the app" />
          <p className="flow-lede">
            Open the ZKPassport app to scan your ID. Your ID is read on your phone and never sent to
            a server.
          </p>
          <div className="scan-hero">
            {url ? (
              <a className="flow-primary" href={url}>
                Open ZKPassport App
              </a>
            ) : (
              <span className="flow-primary" aria-disabled="true">
                Preparing…
              </span>
            )}
            <button type="button" className="scan-reveal" onClick={() => setQrRevealed(true)}>
              Scan a QR code with another device instead
            </button>
          </div>
        </Main>
      </div>
    )
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

// Feature-detected once: most desktop browsers have no share sheet, and an
// inert Share button is worse than none
function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
}

function Fallback({ url }: { url: string | null }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  const [shareable] = useState(canShare)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  if (!url) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setFailed(false)
    } catch {
      // Clipboard access is denied in some embedded browsers; say so rather
      // than leaving the button looking broken
      setFailed(true)
    }
  }

  const share = async () => {
    try {
      await navigator.share({ url, title: "Verify with ZKPassport" })
    } catch {
      // A dismissed share sheet rejects too, so there is nothing to report
    }
  }

  return (
    <div className="scan-fallback">
      <p className="scan-fallback-label">Can&rsquo;t scan the code?</p>
      <div className="scan-fallback-actions">
        <button type="button" className="flow-quietbtn" onClick={copy}>
          <span
            className="flow-glyph"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: ICON_LINK }}
          />
          {copied ? "Link copied" : "Copy link"}
        </button>
        {shareable ? (
          <button type="button" className="flow-quietbtn" onClick={share}>
            <span
              className="flow-glyph"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: ICON_SHARE }}
            />
            Share
          </button>
        ) : null}
      </div>
      <p className="scan-fallback-hint" role={failed ? "alert" : undefined}>
        {failed
          ? "Couldn’t reach the clipboard. Select the QR code and use your browser’s share menu."
          : "Send the link to your phone and open it there."}
      </p>
    </div>
  )
}
