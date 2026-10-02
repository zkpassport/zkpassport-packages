import { defineConfig } from "tsup"

const isDev = process.env.DEV_BUILD === "true"

export default defineConfig(
  (["esm", "cjs"] as const).map((format) => ({
    entry: { index: "src/index.ts" },
    dts: {
      compilerOptions: {
        composite: false,
      },
    },
    clean: true,
    format,
    outDir: `dist/${format}`,
    outExtension: () => ({ js: format === "cjs" ? ".cjs" : ".js" }),
    splitting: false,
    sourcemap: true,
    treeshake: !isDev,
    minify: !isDev,
    // Release builds leave @zkpassport/utils external (tsup externalizes dependencies by
    // default); dev builds inline it for instant edits
    ...(isDev ? { noExternal: [/@zkpassport\/.*/] } : {}),
  })),
)
