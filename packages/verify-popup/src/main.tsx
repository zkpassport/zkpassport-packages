import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./app"
import { rememberAppClipMode } from "./shared/use-open-app"

rememberAppClipMode()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
