import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Grants crossOriginIsolated (SharedArrayBuffer → multithreaded WASM proving)
// WITHOUT COOP, so the window.opener postMessage channel to the RP page survives.
// Supported in Chromium; other browsers ignore it and prove single-threaded.
// The production host must send this header too (see README).
const DOCUMENT_ISOLATION_HEADERS = {
  "Document-Isolation-Policy": "isolate-and-credentialless",
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: DOCUMENT_ISOLATION_HEADERS,
  },
  preview: {
    port: 5173,
    headers: DOCUMENT_ISOLATION_HEADERS,
  },
  optimizeDeps: {
    // These packages load WASM and spawn workers via import.meta.url, which
    // breaks Vite's dependency pre-bundling — serve them as native ESM instead
    exclude: [
      "@aztec/bb.js",
      "@noir-lang/noir_js",
      "@noir-lang/noirc_abi",
      "@noir-lang/acvm_js",
    ],
    esbuildOptions: {
      target: "esnext",
    },
  },
  build: {
    target: "esnext",
  },
})
