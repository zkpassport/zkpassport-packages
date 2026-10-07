import { useEffect, useRef, useState } from "react"
import { openRequestInApp } from "@zkpassport/ui/app-link"

export type AppOpenState = "idle" | "opening" | "nothing-opened"

/**
 * Hands the request to the app and reports what came of it: "opening" while the probe runs, then
 * "nothing-opened" if it reports a miss. A late hand-over takes the miss back.
 */
export function useOpenApp(requestUrl: string | null, { probe }: { probe: boolean }) {
  const [state, setState] = useState<AppOpenState>("idle")
  const stopProbe = useRef<(() => void) | null>(null)
  useEffect(() => () => stopProbe.current?.(), [])

  const openApp = () => {
    if (!requestUrl) return
    stopProbe.current?.()
    if (!probe) {
      stopProbe.current = openRequestInApp(requestUrl)
      return
    }
    setState("opening")
    stopProbe.current = openRequestInApp(requestUrl, (opened) =>
      setState(opened ? "idle" : "nothing-opened"),
    )
  }

  return { state, openApp }
}
