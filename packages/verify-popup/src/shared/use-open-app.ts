import { useEffect, useRef, useState } from "react"
import { detectMobileOs, openRequestInApp } from "@zkpassport/ui/app-link"
import { isInAppBrowser } from "@zkpassport/ui/hosted"

import { isAppClipLane, isSafariUserAgent, isSamePage } from "../verify/lane"

// "opened" is not "idle": the page should say it is waiting, not offer the button again
type AppOpenState = "idle" | "opening" | "opened" | "nothing-opened"

/** Marks a request page this page opened, so that page closes itself when the user comes back */
export const CLOSE_ON_RETURN_HASH = "#close-on-return"

/** Whether iOS can show the App Clip card in this browser */
function showsAppClipCard(): boolean {
  return detectMobileOs() === "ios" && !isInAppBrowser() && isSafariUserAgent(navigator.userAgent)
}

export function canOpenAppClip(requestUrl: string): boolean {
  return isAppClipLane(requestUrl) && showsAppClipCard()
}

/**
 * iOS shows the App Clip card only on the request page, so that page opens in a new tab. This page
 * holds the live request, so it must stay.
 */
function openAppClipPage(requestUrl: string) {
  window.open(requestUrl + CLOSE_ON_RETURN_HASH, "_blank", "noopener")
}

/**
 * Continue from the consent screen. Where iOS can show the App Clip card, the same tap opens the
 * request page, so the card comes right away instead of after one more screen.
 */
export function useContinueToAppClip(requestUrl: string | null, consent: () => void) {
  const [openedUrl, setOpenedUrl] = useState<string | null>(null)

  const onContinue = () => {
    consent()
    if (requestUrl && canOpenAppClip(requestUrl)) {
      openAppClipPage(requestUrl)
      setOpenedUrl(requestUrl)
    }
  }

  return { onContinue, appClipOpened: requestUrl !== null && openedUrl === requestUrl }
}

/**
 * Opens the request in the app. With `probe`, reports "opening", then "opened" once the app has
 * taken over, or "nothing-opened" when nothing did. A request the caller already handed over starts
 * as opened.
 */
export function useOpenApp(
  requestUrl: string | null,
  { probe, opened = false }: { probe: boolean; opened?: boolean },
) {
  const [openState, setOpenState] = useState<AppOpenState>(opened ? "opened" : "idle")
  const stopProbe = useRef<(() => void) | null>(null)
  useEffect(() => () => stopProbe.current?.(), [])

  const openApp = () => {
    if (!requestUrl) return
    stopProbe.current?.()
    // The App Clip is invoked by its https link, never a custom scheme. Browsers without the App
    // Clip card try the full app instead, as from /r. So does the /c page itself: there the link is
    // this page, and the clip didn't take over (iOS offers the clip on this page through its banner)
    if (canOpenAppClip(requestUrl) && !isSamePage(requestUrl, window.location.href)) {
      openAppClipPage(requestUrl)
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
