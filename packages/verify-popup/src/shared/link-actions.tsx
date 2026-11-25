import { useEffect, useState } from "react"

import { ICON_LINK, ICON_SHARE } from "./icons"

const COPIED_RESET_MS = 2000

// Most desktop browsers have no share sheet, and an inert button is worse than none
function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function"
}

type CopyState = "idle" | "copied" | "failed"

/** Copies the link, then says so for a moment; "failed" stays until the next try. */
function useCopy(url: string) {
  const [state, setState] = useState<CopyState>("idle")

  useEffect(() => {
    if (state !== "copied") return
    const timer = window.setTimeout(() => setState("idle"), COPIED_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setState("copied")
    } catch {
      // Some embedded browsers deny clipboard access; say so rather than look broken
      setState("failed")
    }
  }

  return { state, copy }
}

/** The quiet way out of a QR code: one link, which answers in place */
export function CopyLink({ url }: { url: string }) {
  const { state, copy } = useCopy(url)
  return (
    <button type="button" className="scan-reveal" onClick={copy} aria-live="polite">
      {state === "copied"
        ? "Link copied. Open it on your phone."
        : state === "failed"
          ? "Couldn’t copy. Use your browser’s share menu instead."
          : "Can’t scan? Copy the link"}
    </button>
  )
}

export function LinkActions({ url }: { url: string }) {
  const { state, copy } = useCopy(url)
  const copied = state === "copied"
  const [shareable] = useState(canShare)

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
        {copied ? "Link copied" : state === "failed" ? "Couldn’t copy" : "Copy link"}
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
