import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  format: ["cjs"],
  outDir: "dist/cjs",
  dts: true,
  tsconfig: "tsconfig.cjs.json",
  clean: true,
  splitting: false,
})
