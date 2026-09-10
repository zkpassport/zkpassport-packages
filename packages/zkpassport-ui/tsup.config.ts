import { promises as fs } from "node:fs"
import path from "node:path"
import { defineConfig, type Options } from "tsup"

type EsbuildPlugin = NonNullable<Options["esbuildPlugins"]>[number]

const isDev = process.env.DEV_BUILD === "true"

// esbuild strips module directives; re-prepend "use client" on the React entries
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

// Heavy backends sit behind dynamic imports the card never reaches; stub them
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

// npm build: zero runtime deps; only React stays external (optional peer)
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
  dts: {
    compilerOptions: {
      composite: false,
      // Copy the @zkpassport types into our published type files, so
      // consumers don't need to install those packages themselves
      baseUrl: ".",
      paths: {
        // preact must stay external: inlining it breaks the build
        "preact": ["./keep-external"],
        "@zkpassport/sdk": ["../zkpassport-sdk/dist/esm/index.d.ts"],
        "@zkpassport/sdk/popup": ["../zkpassport-sdk/dist/esm/popup.d.ts"],
        "@zkpassport/sdk/query": ["../zkpassport-sdk/dist/esm/query.d.ts"],
        "@zkpassport/utils": ["../zkpassport-utils/dist/esm/index.d.ts"],
      },
    },
    resolve: true,
  },
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

// Hosted build (internal): for the popup only; the real SDK stays external
const hostedConfig: Options = {
  entry: { hosted: "src/hosted.ts" },
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

const cssConfig: Options = {
  entry: { styles: "src/styles.css" },
  outDir: "dist",
  clean: false,
  loader: { ".css": "copy" },
  async onSuccess() {
    // dist/styles.css covers both components; button.css lets the button inject less
    const styles = await fs.readFile(path.resolve("dist/styles.css"), "utf8")
    const button = await fs.readFile(path.resolve("src/button.css"), "utf8")
    if (!styles.includes(".zkp-verify-button")) {
      await fs.writeFile(path.resolve("dist/styles.css"), `${styles}\n${button}`, "utf8")
    }
  },
}

export default defineConfig([...npmConfigs, hostedConfig, cssConfig])
