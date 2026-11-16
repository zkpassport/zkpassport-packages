import { useEffect, useRef, useState } from "react"
import { openRequestInApp } from "@zkpassport/ui/app-link"

import { isAppClipLane, isSamePage } from "../verify/lane"

// "opened" is not "idle": the page should say it is waiting, not offer the button again
type AppOpenState = "idle" | "opening" | "opened" | "nothing-opened"

/**
 * Opens the request in the app. With `probe`, reports "opening", then "opened" once the app has
 * taken over, or "nothing-opened" when nothing did.
 */
export function useOpenApp(requestUrl: string | null, { probe }: { probe: boolean }) {
  const [openState, setOpenState] = useState<AppOpenState>("idle")
  const stopProbe = useRef<(() => void) | null>(null)
  useEffect(() => () => stopProbe.current?.(), [])

  const openApp = () => {
    if (!requestUrl) return
    stopProbe.current?.()
    // The App Clip is invoked by its https link, never a custom scheme; a new tab keeps this page.
    // On the /c page itself that link is this page: the clip didn't take over, so the full app is
    // tried instead, as from /r (iOS offers the clip on this page through its banner)
    if (isAppClipLane(requestUrl) && !isSamePage(requestUrl, window.location.href)) {
      window.open(requestUrl, "_blank", "noopener")
      setOpenState("opened")
      return
    }
    if (!probe) {
      stopProbe.current = openRequestInApp(requestUrl)
      return
    }
    setOpenState("opening")
    stopProbe.current = openRequestInApp(requestUrl, (appTookOver) =>
      setOpenState(appTookOver ? "opened" : "nothing-opened"),
    )
  }

  return { openState, openApp }
}
