#!/usr/bin/env node
/**
 * Re-inline the @zkpassport/ui IIFE bundle into index.html.
 *
 * Why inline instead of `<script src="…">`: Chrome treats each file:// URL
 * as a unique origin and blocks cross- (and recently same-) directory script
 * loads. Inlining is the only way this demo opens via double-click in every
 * modern browser without a static server.
 *
 * Run from this folder:
 *   bun run sync-bundle
 * (or `node sync-bundle.mjs` if you'd rather skip bun).
 */
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.resolve(here, "../../packages/zkpassport-ui/dist/umd/zkpassport-ui.js")
const htmlPath = path.resolve(here, "index.html")

const bundle = readFileSync(bundlePath, "utf8")
const html = readFileSync(htmlPath, "utf8")

const begin = "<!-- BEGIN INLINED IIFE -->"
const end = "<!-- END INLINED IIFE -->"
if (!html.includes(begin) || !html.includes(end)) {
  console.error(`error: index.html is missing the ${begin} / ${end} markers`)
  process.exit(1)
}

// The bundle is minified and contains no `</script>` substring, so it's safe
// to drop directly between tags without escaping. The marker comments stay
// in place so a future sync keeps working on the regenerated file.
const replacement = `${begin}\n    <script>${bundle}</script>\n    ${end}`
const updated = html.replace(
  new RegExp(`${begin}[\\s\\S]*?${end}`),
  replacement,
)

writeFileSync(htmlPath, updated, "utf8")
console.log(`inlined ${(bundle.length / 1024).toFixed(1)} KB of IIFE into index.html`)
