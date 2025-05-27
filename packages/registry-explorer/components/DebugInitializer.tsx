"use client"

import debug from "debug"
import { useEffect } from "react"

function DebugInitializer() {
  useEffect(() => {
    // Only enable in development mode
    if (process.env.NODE_ENV === "development") {
      debug.enable("explorer*,zkpassport*")
    }
  }, [])
  return null
}

export { DebugInitializer }
