import React from "react"
import ReactDOM from "react-dom/client"
import { RequestPage } from "./page"

const root = ReactDOM.createRoot(document.getElementById("root")!)

if (new URLSearchParams(window.location.hash.slice(1)).has("s")) {
  import("../app").then(({ App }) =>
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    ),
  )
} else {
  root.render(
    <React.StrictMode>
      <RequestPage />
    </React.StrictMode>,
  )
}
