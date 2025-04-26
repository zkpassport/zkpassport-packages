import { build } from "esbuild"

const isWatchMode = process.argv.includes("--watch")

async function runBuild() {
  try {
    // Build ESM version
    await build({
      entryPoints: ["./src/index.ts"],
      outfile: "./dist/esm/index.js",
      bundle: true,
      minify: true,
      sourcemap: false,
      platform: "browser",
      format: "esm",
      target: ["es2020"],
    })
    // Build CJS version
    await build({
      entryPoints: ["./src/index.ts"],
      outfile: "./dist/cjs/index.js",
      bundle: true,
      minify: true,
      sourcemap: false,
      platform: "node",
      format: "cjs",
      target: ["es2020"],
    })
    console.log("Build completed successfully")
  } catch (error) {
    console.error("❌ Build failed:", error)
    process.exit(1)
  }
}

// Handle watch mode if requested
if (isWatchMode) {
  process.stdin.on("close", () => process.exit(0))
  process.stdin.resume()
  console.log("👀 Watching for changes...")
  // Set up simple rebuild on change
  const { watch } = await import("fs/promises")
  const watcher = watch("./src", { recursive: true })
  // Build and watch for changes
  await runBuild()
  for await (const event of watcher) {
    if (event.filename.endsWith(".ts")) {
      console.log(`File changed: ${event.filename}, rebuilding...`)
      await runBuild()
    }
  }
} else {
  // Build once
  await runBuild()
}
