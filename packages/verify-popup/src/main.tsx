import React, { Suspense, lazy } from "react"
import ReactDOM from "react-dom/client"
import { App } from "./app"
import { Frame, Notice } from "./shared/frame"

const StandaloneMint = lazy(() =>
  import("./mint/standalone").then((module) => ({ default: module.StandaloneMint })),
)

// The hosted mint page has no opening website, so it never enters the popup's session handling
const isMintPage = window.location.pathname.replace(/\/$/, "") === "/mint"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isMintPage ? (
      <Frame>
        <Suspense fallback={<Notice>Loading…</Notice>}>
          <StandaloneMint />
        </Suspense>
      </Frame>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
