import React from "react"
import ReactDOM from "react-dom/client"
import { StandaloneMint } from "../mint/standalone"
import { Frame } from "../shared/frame"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Frame>
      <StandaloneMint />
    </Frame>
  </React.StrictMode>,
)
