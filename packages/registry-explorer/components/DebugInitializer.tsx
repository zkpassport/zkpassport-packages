"use client"

import { useEffect } from "react"
import debug from "debug"

function DebugInitializer() {
  useEffect(() => {
    // Only enable in development mode
    if (process.env.NODE_ENV === "development") {
      debug.enable("explorer,zkpassport*")
    }
  }, [])
  return null
}

export { DebugInitializer }
