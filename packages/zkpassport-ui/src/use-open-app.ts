import { useEffect, useRef, useState } from "preact/hooks"

import { openRequestInApp } from "./app-link"

type AppOpenState = "idle" | "opening" | "nothing-opened"

/**
 * Opens the request in the app. With `probe`, reports "opening" and then "nothing-opened" when the
 * app does not take the link; switching to the app later takes that back.
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
    stopProbe.current = openRequestInApp(requestUrl, (opened) =>
      setOpenState(opened ? "idle" : "nothing-opened"),
    )
  }

  return { openState, openApp }
}
