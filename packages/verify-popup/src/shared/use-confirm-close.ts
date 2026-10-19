import { useEffect } from "react"

/** Browsers supply their own wording, and ignore this without a prior click. */
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
