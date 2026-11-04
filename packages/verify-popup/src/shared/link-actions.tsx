import { useEffect, useState } from "react"

import { ICON_LINK, ICON_SHARE } from "./icons"

const COPIED_RESET_MS = 2000

// Most desktop browsers have no share sheet, and an inert button is worse than none
function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
}

export function LinkActions({
  url,
  onCopyFailedChange,
}: {
  url: string
  onCopyFailedChange?: (failed: boolean) => void
}) {
  const [copied, setCopied] = useState(false)
  const [shareable] = useState(canShare)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      onCopyFailedChange?.(false)
    } catch {
      // Some embedded browsers deny clipboard access; say so rather than look broken
      onCopyFailedChange?.(true)
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
    <div className="flow-link-actions">
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
  )
}
