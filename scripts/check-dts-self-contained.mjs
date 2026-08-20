#!/usr/bin/env node
// Checks that the built type files work on their own, without the packages
// they were bundled from. Nothing else fails when this breaks — only this check.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const FOLDERS = ["dist/esm", "dist/cjs"]

// The only packages the shipped types may import (declared peer dependencies)
const ALLOWED_PACKAGES = new Set(["react", "react-dom", "react/jsx-runtime"])

// Grabs the module name from import / export-from / require statements
const MODULE_NAME = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g

const problems = new Set()
let filesChecked = 0

for (const folder of FOLDERS) {
  for (const file of readdirSync(folder)) {
    if (!file.endsWith(".d.ts") && !file.endsWith(".d.cts")) continue
    filesChecked++
    const text = readFileSync(path.join(folder, file), "utf8")
    for (const [, moduleName] of text.matchAll(MODULE_NAME)) {
      if (moduleName.startsWith(".")) {
        // an import of "./x.js" points at "./x.d.ts" — that file must exist
        const target = path
          .join(folder, moduleName)
          .replace(/\.js$/, ".d.ts")
          .replace(/\.cjs$/, ".d.cts")
        if (!existsSync(target)) {
          problems.add(`${folder}/${file}: ${moduleName} (no such file)`)
        }
      } else if (!ALLOWED_PACKAGES.has(moduleName)) {
        // consumers won't have this package installed
        problems.add(`${folder}/${file}: ${moduleName}`)
      }
    }
  }
}

if (filesChecked === 0) {
  console.error("❌ no .d.ts files found — run the build first")
  process.exit(1)
}
if (problems.size > 0) {
  console.error("❌ shipped types are not self-contained:")
  for (const problem of problems) console.error(`   ${problem}`)
  process.exit(1)
}
console.log(`✅ ${filesChecked} declaration files are self-contained`)
