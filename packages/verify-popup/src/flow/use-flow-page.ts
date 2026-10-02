import { useLayoutEffect } from "react"
import { injectStyles } from "@zkpassport/ui/hosted"

import "./flow.css"

/**
 * Prepares the page a flow card sits on: the card's own stylesheet, which the
 * frame reuses, and the dark backdrop. The body class is only set while a flow
 * is mounted, so the popup's other screens keep the default background.
 */
export function useFlowPage() {
  useLayoutEffect(injectStyles, [])
  useLayoutEffect(() => {
    document.body.classList.add("zkp-flow-page")
    return () => document.body.classList.remove("zkp-flow-page")
  }, [])
}
