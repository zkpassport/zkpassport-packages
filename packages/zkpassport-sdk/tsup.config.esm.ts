import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  format: "esm",
  outDir: "dist/esm",
  outExtension: () => ({ js: ".js" }),
  dts: false, // Types are handled by tsc -b
  clean: true,
  splitting: false,
  sourcemap: false,
  treeshake: true,
  external: [
    // Externalize workspace dependencies for release builds
    "@zkpassport/utils",
    "@zkpassport/registry",
  ],
})
