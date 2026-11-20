import React from "react"
import ReactDOM from "react-dom/client"
import { Frame } from "../shared/frame"
import { MintPage } from "./page"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Frame>
      <MintPage />
    </Frame>
  </React.StrictMode>,
)
