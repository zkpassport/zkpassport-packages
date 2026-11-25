import { useEffect } from "react"

/** Browsers supply their own wording, and ignore this without a prior click. */
let leavingOnPurpose = false

/** Leaves for another page of this flow without the close warning. */
export function leaveWithoutAsking(url: string) {
  leavingOnPurpose = true
  window.location.assign(url)
}

export function useConfirmClose(active: boolean) {
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => {
      if (leavingOnPurpose) return
      event.preventDefault()
      // Still required by some browsers that ignore preventDefault alone
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [active])
}
