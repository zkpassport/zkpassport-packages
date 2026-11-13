import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

// Grants crossOriginIsolated (SharedArrayBuffer → multithreaded WASM proving)
// WITHOUT COOP, so the window.opener postMessage channel to the RP page survives.
// Supported in Chromium; other browsers ignore it and prove single-threaded.
const DOCUMENT_ISOLATION_HEADERS = {
  "Document-Isolation-Policy": "isolate-and-credentialless",
}

// With this tag iPhone Safari offers the App Clip, but only where the page is shown under
// zkpassport.id, the domain the clip is tied to.
const APP_CLIP_TAG =
  '<meta name="apple-itunes-app" content="app-id=6477371975, app-clip-bundle-id=app.zkpassport.zkpassport.clip, app-clip-display=card" />'

/**
 * Builds the /c page: the /r page plus the App Clip tag. /r stays without the tag, where it would
 * show Apple's plain app banner, which opens the app without the request.
 */
function appClipRequestPage(): Plugin {
  return {
    name: "app-clip-request-page",
    enforce: "post",
    generateBundle(_, bundle) {
      const requestPage = bundle["r.html"]
      if (requestPage?.type !== "asset") return
      this.emitFile({
        type: "asset",
        fileName: "c.html",
        source: String(requestPage.source).replace("<head>", `<head>\n    ${APP_CLIP_TAG}`),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), appClipRequestPage()],
  resolve: {
    alias: {
      // internal build of @zkpassport/ui, not part of its public exports
      "@zkpassport/ui/hosted": fileURLToPath(
        new URL("../zkpassport-ui/dist/hosted.js", import.meta.url),
      ),
      "@zkpassport/ui/hosted-credential": fileURLToPath(
        new URL("../zkpassport-ui/dist/hosted-credential.js", import.meta.url),
      ),
      // The hosted bundle imports the SDK, which /r must not carry; this build stands alone
      "@zkpassport/ui/app-link": fileURLToPath(
        new URL("../zkpassport-ui/dist/app-link.js", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    headers: DOCUMENT_ISOLATION_HEADERS,
  },
  preview: {
    port: 5173,
    headers: DOCUMENT_ISOLATION_HEADERS,
    // Phone testing goes through a Cloudflare quick tunnel, and preview rejects unknown hosts
    allowedHosts: [".trycloudflare.com"],
  },
  optimizeDeps: {
    // These packages load WASM and spawn workers via import.meta.url, which
    // breaks Vite's dependency pre-bundling — serve them as native ESM instead
    exclude: [
      "@aztec/bb.js",
      "@aztec-foundation/bb.js",
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
    rollupOptions: {
      // /r is its own page so it stays free of the SDK, wagmi and the proving backends
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        r: fileURLToPath(new URL("r.html", import.meta.url)),
      },
    },
  },
})
