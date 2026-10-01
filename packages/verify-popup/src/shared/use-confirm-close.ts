import { useEffect } from "react"

/**
 * Asks the browser to confirm before the window goes away, while `active`.
 * Only worth it once closing would destroy work the user cannot get back:
 * a proof being generated, or a verified proof not yet spent.
 *
 * Browsers supply their own wording and ignore this without a prior click,
 * so there is nothing to configure and nothing to test in a fresh tab.
 */
export function useConfirmClose(active: boolean) {
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Still required by some browsers that ignore preventDefault alone
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [active])
}
