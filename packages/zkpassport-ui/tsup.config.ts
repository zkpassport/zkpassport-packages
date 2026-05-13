import { promises as fs } from "node:fs"
import path from "node:path"
import { defineConfig, type Options } from "tsup"

const isDev = process.env.DEV_BUILD === "true"

/**
 * esbuild strips module-level directives like `"use client"` during bundling
 * (it warns: "Module level directives cause errors when bundled"). Using
 * tsup's `banner` option doesn't help — the banner is treated the same way.
 *
 * The reliable fix is to prepend the directive to the output file AFTER the
 * bundle is written. We do that here only for the React entry (`index.*`);
 * the vanilla entry stays directive-free so it can be imported into any
 * environment that supports the duck-typed runtime contract.
 */
async function prependUseClient(outDir: string, format: "esm" | "cjs") {
  const file = path.resolve(outDir, format === "cjs" ? "index.cjs" : "index.js")
  try {
    const content = await fs.readFile(file, "utf8")
    if (!content.startsWith('"use client"')) {
      await fs.writeFile(file, `"use client";\n${content}`, "utf8")
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }
}

// 1) ESM + CJS for npm consumers (React + vanilla entries)
const npmConfigs: Options[] = (["esm", "cjs"] as const).map((format) => ({
  entry: {
    index: "src/index.ts",
    vanilla: "src/vanilla.ts",
  },
  format,
  outDir: `dist/${format}`,
  outExtension: () => ({ js: format === "cjs" ? ".cjs" : ".js" }),
  // Match the SDK's dts config to avoid divergent type-build behavior across workspace packages.
  dts: { compilerOptions: { composite: false } },
  clean: true,
  splitting: false,
  sourcemap: true,
  treeshake: !isDev,
  minify: !isDev,
  external: ["react", "react-dom", "react/jsx-runtime", "qrcode"],
  loader: { ".css": "text" },
  async onSuccess() {
    await prependUseClient(`dist/${format}`, format)
  },
}))

// 2) IIFE bundle for <script> tag — bundles everything (qrcode + CSS string baked in).
const umdConfig: Options = {
  entry: { "zkpassport-ui": "src/vanilla.ts" },
  format: "iife",
  globalName: "ZKPassportUI",
  outDir: "dist/umd",
  // Override tsup's default `.global.js` suffix; we want a clean `zkpassport-ui.js`.
  outExtension: () => ({ js: ".js" }),
  // Don't clean dist (npmConfigs already did); just our subfolder.
  clean: false,
  splitting: false,
  sourcemap: true,
  minify: !isDev,
  noExternal: [/.*/],
  loader: { ".css": "text" },
  // Without this, esbuild ignores the `browser` field in qrcode's package.json
  // and bundles its Node entry — which calls `require("fs")` for terminal QR
  // rendering and crashes the IIFE at load time in any browser.
  platform: "browser",
}

// 3) Standalone CSS at dist/styles.css for CSP-strict consumers.
const cssConfig: Options = {
  entry: { styles: "src/core/styles.css" },
  outDir: "dist",
  clean: false,
  loader: { ".css": "copy" },
}

export default defineConfig([...npmConfigs, umdConfig, cssConfig])
