import { promises as fs } from "node:fs"
import path from "node:path"
import { defineConfig, type Options } from "tsup"

type EsbuildPlugin = NonNullable<Options["esbuildPlugins"]>[number]

const isDev = process.env.DEV_BUILD === "true"

// esbuild strips module-level directives during bundling, so the React entries'
// "use client" must be prepended to the output files after the bundle is written.
async function prependUseClient(outDir: string, format: "esm" | "cjs") {
  const ext = format === "cjs" ? "cjs" : "js"
  for (const name of ["react", "react-button"]) {
    const file = path.resolve(outDir, `${name}.${ext}`)
    try {
      const content = await fs.readFile(file, "utf8")
      if (!content.startsWith('"use client"')) {
        await fs.writeFile(file, `"use client";\n${content}`, "utf8")
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
    }
  }
}

// The published bundle inlines the SDK, whose heavy backends are behind dynamic
// imports the card never reaches (proof verification is skipped, browser proving
// is popup-only). They are stubbed out so the bundle is fully self-contained and
// consumer bundlers never try to resolve them. If a stubbed path is ever reached,
// member access on the empty module throws and the SDK's guards handle it.
const STUBBED_DEPS = /^(@aztec\/bb\.js(-v4)?|@noir-lang\/noir_js|viem(\/.*)?|ws)$/

const stubUnreachableDeps: EsbuildPlugin = {
  name: "stub-unreachable-deps",
  setup(build) {
    build.onResolve({ filter: STUBBED_DEPS }, (args) => ({
      path: args.path,
      namespace: "zkp-stub",
    }))
    build.onLoad({ filter: /.*/, namespace: "zkp-stub" }, () => ({
      contents: "module.exports = {}",
      loader: "js",
    }))
  },
}

// Published npm build: zero runtime dependencies. Everything (preact, qrcode,
// the SDK and its request-flow dependencies) is inlined; only React stays
// external as an optional peer for the /react entry.
const npmConfigs: Options[] = (["esm", "cjs"] as const).map((format) => ({
  entry: {
    "index": "src/vanilla/index.ts",
    "react": "src/react/index.tsx",
    "button": "src/button/index.ts",
    "react-button": "src/react/button.tsx",
  },
  format,
  outDir: `dist/${format}`,
  outExtension: () => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  dts: { compilerOptions: { composite: false } },
  clean: true,
  splitting: false,
  sourcemap: true,
  treeshake: !isDev,
  minify: !isDev,
  platform: "browser",
  external: ["react", "react-dom", "react/jsx-runtime"],
  esbuildPlugins: [stubUnreachableDeps],
  loader: { ".css": "text" },
  async onSuccess() {
    await prependUseClient(`dist/${format}`, format)
  },
}))

// Hosted build: used ONLY by ZKPassport's hosted verification popup, which needs
// the real SDK (browser proving and verification run there). The SDK stays
// external and resolves from the popup's own dependencies — nothing is stubbed.
// Not part of the public API.
const hostedConfig: Options = {
  entry: { hosted: "src/react/index.tsx" },
  format: "esm",
  outDir: "dist",
  dts: { compilerOptions: { composite: false } },
  clean: false,
  splitting: false,
  sourcemap: true,
  treeshake: !isDev,
  minify: !isDev,
  platform: "browser",
  external: ["react", "react-dom", "react/jsx-runtime", /^@zkpassport\/sdk/],
  loader: { ".css": "text" },
}

// CDN build: a single self-contained IIFE for <script> tag integrations
// (no npm, no bundler). Exposes window.ZKPassportUI and auto-mounts
// #verify-with-zkpassport / [data-zkpassport] elements.
const cdnConfig: Options = {
  entry: {
    // zkpassport-button.js is the default for button-only script-tag
    // integrations; zkpassport-ui.js adds the embeddable QR card
    "zkpassport-button": "src/cdn-button.ts",
    "zkpassport-ui": "src/cdn.ts",
  },
  format: "iife",
  outDir: "dist/cdn",
  globalName: "ZKPassportUI",
  clean: false,
  splitting: false,
  sourcemap: true,
  treeshake: !isDev,
  minify: !isDev,
  platform: "browser",
  esbuildPlugins: [stubUnreachableDeps],
  loader: { ".css": "text" },
}

const cssConfig: Options = {
  entry: { styles: "src/styles.css" },
  outDir: "dist",
  clean: false,
  loader: { ".css": "copy" },
  async onSuccess() {
    // The exported stylesheet covers both components; the button rules live in
    // their own file so the button entry can inject only what it needs
    const styles = await fs.readFile(path.resolve("dist/styles.css"), "utf8")
    const button = await fs.readFile(path.resolve("src/button.css"), "utf8")
    if (!styles.includes(".zkp-verify-button")) {
      await fs.writeFile(path.resolve("dist/styles.css"), `${styles}\n${button}`, "utf8")
    }
  },
}

export default defineConfig([...npmConfigs, hostedConfig, cdnConfig, cssConfig])
