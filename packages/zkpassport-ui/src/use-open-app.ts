import { useEffect, useRef, useState } from "preact/hooks"

import { openRequestInApp } from "./app-link"

// "opened" is not "idle": the page should say it is waiting, not offer the button again
type AppOpenState = "idle" | "opening" | "opened" | "nothing-opened"

/**
 * Opens the request in the app. With `probe`, reports "opening", then "opened" once the app has
 * taken over, or "nothing-opened" when nothing did.
 */
export function useOpenApp(requestUrl: string | null, { probe }: { probe: boolean }) {
  const [openState, setOpenState] = useState<AppOpenState>("idle")
  const stopProbe = useRef<(() => void) | null>(null)

  // A new request starts over: whatever happened to the last one no longer applies
  useEffect(() => {
    setOpenState("idle")
    return () => stopProbe.current?.()
  }, [requestUrl])

  const openApp = () => {
    if (!requestUrl) return
    stopProbe.current?.()
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
