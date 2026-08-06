import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// crossOriginIsolated without COOP (Chromium-only) so window.opener survives; prod must send this header too
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
    // These packages load WASM and spawn workers via import.meta.url, which breaks Vite's dependency pre-bundling —…
    exclude: [
      "@aztec/bb.js",
      "@aztec/bb.js-v4",
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
