import { promises as fs } from "node:fs"
import path from "node:path"
import { defineConfig, type Options } from "tsup"

const isDev = process.env.DEV_BUILD === "true"

// esbuild strips module-level directives during bundling, so the React entry's
// "use client" must be prepended to the output file after the bundle is written.
async function prependUseClient(outDir: string, format: "esm" | "cjs") {
  const file = path.resolve(outDir, format === "cjs" ? "react.cjs" : "react.js")
  try {
    const content = await fs.readFile(file, "utf8")
    if (!content.startsWith('"use client"')) {
      await fs.writeFile(file, `"use client";\n${content}`, "utf8")
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
  }
}

const npmConfigs: Options[] = (["esm", "cjs"] as const).map((format) => ({
  entry: {
    index: "src/vanilla/index.ts",
    react: "src/react/index.tsx",
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
  // Preact is bundled inline so consumers don't need to install it. React
  // stays external — it's a peer dep used by the React wrapper only.
  external: ["react", "react-dom", "react/jsx-runtime", "qrcode", "@zkpassport/sdk"],
  noExternal: ["preact"],
  loader: { ".css": "text" },
  async onSuccess() {
    await prependUseClient(`dist/${format}`, format)
  },
}))

const cssConfig: Options = {
  entry: { styles: "src/styles.css" },
  outDir: "dist",
  clean: false,
  loader: { ".css": "copy" },
}

export default defineConfig([...npmConfigs, cssConfig])
