import { defineConfig } from "tsup"

// ESM only: @aztec-labs/aztec.js, which this package hands its values to, is ESM only
export default defineConfig({
  entry: ["src/index.ts"],
  dts: {
    compilerOptions: {
      composite: false,
    },
  },
  clean: true,
  format: "esm",
  outDir: "dist",
  splitting: false,
  sourcemap: true,
  treeshake: true,
  minify: true,
})
