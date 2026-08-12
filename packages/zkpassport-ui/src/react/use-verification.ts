import { useEffect, useRef, useState } from "react"

import {
  createVerification,
  type VerificationOptions,
  type VerificationState,
} from "../verification"

export type ZKPassportVerification = VerificationState & {
  isLoading: boolean
  verify: () => void
}

/** Headless verification: call `verify` from your own UI and render `status` however you like. */
export function useVerifyWithZKPassport(options: VerificationOptions): ZKPassportVerification {
  const [state, setState] = useState<VerificationState>({ status: "idle", error: null })
  // Read at click time, so callers don't have to memoise their options or callbacks
  const latestOptions = useRef(options)
  latestOptions.current = options

  const [verification] = useState(() => createVerification(() => latestOptions.current, setState))

  useEffect(() => verification.close, [verification])

  return {
    ...state,
    isLoading: state.status === "in-progress",
    verify: verification.verify,
  }
}
