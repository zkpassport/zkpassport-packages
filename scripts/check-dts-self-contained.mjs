#!/usr/bin/env node
// Verifies the built type declarations are self-contained, i.e. they work for
// consumers who install @zkpassport/ui and nothing else.
//
// Why: the dts inlining in tsup.config.ts relies on undocumented tsup
// behavior and can silently regress — a tsup upgrade or a stale path can make
// it emit `import ... from "@zkpassport/sdk"` again, or reference chunk files
// it never wrote. tsc, publint and attw all stay green when that happens;
// this check is the only thing that fails.
//
// Read-only; runs from packages/zkpassport-ui via `bun run validate-package`.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

// Folders whose declaration files must be self-contained
const FOLDERS = ["dist/esm", "dist/cjs"]

// The only packages the shipped types may import (our declared peer deps)
const ALLOWED_PACKAGES = new Set(["react", "react-dom", "react/jsx-runtime"])

// Matches the module name in `import ... from "x"`, `export ... from "x"`,
// `import("x")` and `require("x")`
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
        // Relative import: `./chunk.js` in a d.ts means `./chunk.d.ts` on
        // disk — the referenced declaration file must have been emitted
        const target = path
          .join(folder, moduleName)
          .replace(/\.js$/, ".d.ts")
          .replace(/\.cjs$/, ".d.cts")
        if (!existsSync(target)) {
          problems.add(`${folder}/${file}: ${moduleName} (no such file in dist)`)
        }
      } else if (!ALLOWED_PACKAGES.has(moduleName)) {
        // Package import: consumers won't have this installed
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
  console.error("   (the dts inlining in tsup.config.ts has regressed)")
  process.exit(1)
}
console.log(`✅ ${filesChecked} declaration files are self-contained`)
